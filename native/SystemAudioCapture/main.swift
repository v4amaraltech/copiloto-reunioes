// SystemAudioDump — captura o áudio do sistema via ScreenCaptureKit (macOS 13+)
// e escreve PCM Int16LE intercalado, estéreo, 24kHz no stdout.
//
// Substitui o binário legado do Pickle Glass, que usava uma API de captura
// antiga e passou a entregar silêncio em versões recentes do macOS.
//
// Build (a partir da raiz do repo):
//   xcrun swiftc -O -target arm64-apple-macos13.0 native/SystemAudioCapture/main.swift -o /tmp/sad-arm64
//   xcrun swiftc -O -target x86_64-apple-macos13.0 native/SystemAudioCapture/main.swift -o /tmp/sad-x64
//   lipo -create /tmp/sad-arm64 /tmp/sad-x64 -output src/ui/assets/SystemAudioDump
//   codesign -s - --force src/ui/assets/SystemAudioDump

import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

let kSampleRate = 24000
let kChannels = 2

func logErr(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

final class Capturer: NSObject, SCStreamOutput, SCStreamDelegate {
    private let out = FileHandle.standardOutput
    private var received = 0
    private var converted = 0

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        received += 1
        if received == 1, let absd = sb.formatDescription?.audioStreamBasicDescription {
            logErr("fmt: rate=\(absd.mSampleRate) ch=\(absd.mChannelsPerFrame) flags=\(absd.mFormatFlags) bits=\(absd.mBitsPerChannel)")
        }
        if received % 100 == 0 {
            logErr("buffers: received=\(received) converted=\(converted)")
        }
        guard let pcm = sb.asPCMBuffer else {
            if received <= 3 { logErr("asPCMBuffer=nil no buffer \(received)") }
            return
        }
        converted += 1
        let frames = Int(pcm.frameLength)
        guard frames > 0, let floatData = pcm.floatChannelData else { return }
        let srcChannels = Int(pcm.format.channelCount)

        var interleaved = [Int16](repeating: 0, count: frames * kChannels)
        for f in 0..<frames {
            for c in 0..<kChannels {
                let sample = floatData[min(c, srcChannels - 1)][f]
                let clamped = max(-1.0, min(1.0, sample))
                interleaved[f * kChannels + c] = Int16(clamped * 32767.0)
            }
        }
        interleaved.withUnsafeBufferPointer { ptr in
            out.write(Data(buffer: ptr))
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        logErr("stream stopped: \(error.localizedDescription)")
        exit(1)
    }
}

// Diagnóstico TCC: o macOS entrega áudio SILENCIOSO (zeros) quando o processo
// não tem permissão efetiva de captura — sem nenhum erro. Perguntamos direto.
let hasAccess = CGPreflightScreenCaptureAccess()
logErr("preflight screen-capture access: \(hasAccess)")
if !hasAccess {
    logErr("requesting screen-capture access...")
    CGRequestScreenCaptureAccess()
}

let capturer = Capturer()
// Referência global: sem ela o SCStream é desalocado ao fim do Task e a
// captura morre com "connection interrupted".
var activeStream: SCStream?

Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else {
            logErr("error: no display found")
            exit(1)
        }
        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = kSampleRate
        config.channelCount = kChannels
        // Vídeo mínimo obrigatório pelo SCK; não é lido nem gravado.
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let stream = SCStream(filter: filter, configuration: config, delegate: capturer)
        activeStream = stream
        try stream.addStreamOutput(capturer, type: .audio, sampleHandlerQueue: DispatchQueue(label: "v4.audio"))
        try await stream.startCapture()
        logErr("✅ Capturing system audio. Press ⌃C to stop.")
    } catch {
        logErr("error starting capture: \(error.localizedDescription)")
        exit(1)
    }
}

dispatchMain()

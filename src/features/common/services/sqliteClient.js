const Database = require('better-sqlite3');
const path = require('path');
const LATEST_SCHEMA = require('../config/schema');

class SQLiteClient {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.defaultUserId = 'default_user';
    }

    connect(dbPath) {
        if (this.db) {
            console.log('[SQLiteClient] Already connected.');
            return;
        }

        try {
            this.dbPath = dbPath;
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            console.log('[SQLiteClient] Connected successfully to:', this.dbPath);
        } catch (err) {
            console.error('[SQLiteClient] Could not connect to database', err);
            throw err;
        }
    }

    getDb() {
        if (!this.db) {
            throw new Error("Database not connected. Call connect() first.");
        }
        return this.db;
    }

    _validateAndQuoteIdentifier(identifier) {
        if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
            throw new Error(`Invalid database identifier used: ${identifier}. Only alphanumeric characters and underscores are allowed.`);
        }
        return `"${identifier}"`;
    }

    _migrateProviderSettings() {
        const tablesInDb = this.getTablesFromDb();
        if (!tablesInDb.includes('provider_settings')) {
            return; // Table doesn't exist, no migration needed.
        }
    
        const providerSettingsInfo = this.db.prepare(`PRAGMA table_info(provider_settings)`).all();
        const hasUidColumn = providerSettingsInfo.some(col => col.name === 'uid');
    
        if (hasUidColumn) {
            console.log('[DB Migration] Old provider_settings schema detected. Starting robust migration...');
    
            try {
                this.db.transaction(() => {
                    this.db.exec('ALTER TABLE provider_settings RENAME TO provider_settings_old');
                    console.log('[DB Migration] Renamed provider_settings to provider_settings_old');
    
                    this.createTable('provider_settings', LATEST_SCHEMA.provider_settings);
                    console.log('[DB Migration] Created new provider_settings table');
    
                    // Dynamically build the migration query for robustness
                    const oldColumnNames = this.db.prepare(`PRAGMA table_info(provider_settings_old)`).all().map(c => c.name);
                    const newColumnNames = LATEST_SCHEMA.provider_settings.columns.map(c => c.name);
                    const commonColumns = newColumnNames.filter(name => oldColumnNames.includes(name));
    
                    if (!commonColumns.includes('provider')) {
                        console.warn('[DB Migration] Old table is missing the "provider" column. Aborting migration for this table.');
                        this.db.exec('DROP TABLE provider_settings_old');
                        return;
                    }
    
                    const orderParts = [];
                    if (oldColumnNames.includes('updated_at')) orderParts.push('updated_at DESC');
                    if (oldColumnNames.includes('created_at')) orderParts.push('created_at DESC');
                    const orderByClause = orderParts.length > 0 ? `ORDER BY ${orderParts.join(', ')}` : '';
    
                    const columnsForInsert = commonColumns.map(c => this._validateAndQuoteIdentifier(c)).join(', ');
    
                    const migrationQuery = `
                        INSERT INTO provider_settings (${columnsForInsert})
                        SELECT ${columnsForInsert}
                        FROM (
                            SELECT *, ROW_NUMBER() OVER(PARTITION BY provider ${orderByClause}) as rn
                            FROM provider_settings_old
                        )
                        WHERE rn = 1
                    `;
                    
                    console.log(`[DB Migration] Executing robust migration query for columns: ${commonColumns.join(', ')}`);
                    const result = this.db.prepare(migrationQuery).run();
                    console.log(`[DB Migration] Migrated ${result.changes} rows to the new provider_settings table.`);
    
                    this.db.exec('DROP TABLE provider_settings_old');
                    console.log('[DB Migration] Dropped provider_settings_old table.');
                })();
                console.log('[DB Migration] provider_settings migration completed successfully.');
            } catch (error) {
                console.error('[DB Migration] Failed to migrate provider_settings table.', error);
                
                // Try to recover by dropping the temp table if it exists
                const oldTableExists = this.getTablesFromDb().includes('provider_settings_old');
                if (oldTableExists) {
                    this.db.exec('DROP TABLE provider_settings_old');
                    console.warn('[DB Migration] Cleaned up temporary old table after failure.');
                }
                throw error;
            }
        }
    }

    async synchronizeSchema() {
        console.log('[DB Sync] Starting schema synchronization...');

        // Run special migration for provider_settings before the generic sync logic
        this._migrateProviderSettings();

        const tablesInDb = this.getTablesFromDb();

        for (const tableName of Object.keys(LATEST_SCHEMA)) {
            const tableSchema = LATEST_SCHEMA[tableName];

            if (!tablesInDb.includes(tableName)) {
                // Table doesn't exist, create it
                this.createTable(tableName, tableSchema);
            } else {
                // Table exists, check for missing columns
                this.updateTable(tableName, tableSchema);
            }
        }
        console.log('[DB Sync] Schema synchronization finished.');
    }

    getTablesFromDb() {
        const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        return tables.map(t => t.name);
    }

    createTable(tableName, tableSchema) {
        const safeTableName = this._validateAndQuoteIdentifier(tableName);
        const columnDefs = tableSchema.columns
            .map(col => `${this._validateAndQuoteIdentifier(col.name)} ${col.type}`)
            .join(', ');
        
        const constraints = tableSchema.constraints || [];
        const constraintsDef = constraints.length > 0 ? ', ' + constraints.join(', ') : '';
        
        const query = `CREATE TABLE IF NOT EXISTS ${safeTableName} (${columnDefs}${constraintsDef})`;
        console.log(`[DB Sync] Creating table: ${tableName}`);
        this.db.exec(query);
    }

    updateTable(tableName, tableSchema) {
        const safeTableName = this._validateAndQuoteIdentifier(tableName);
        
        // Get current columns
        const currentColumns = this.db.prepare(`PRAGMA table_info(${safeTableName})`).all();
        const currentColumnNames = currentColumns.map(col => col.name);

        // Check for new columns to add
        const newColumns = tableSchema.columns.filter(col => !currentColumnNames.includes(col.name));

        if (newColumns.length > 0) {
            console.log(`[DB Sync] Adding ${newColumns.length} new column(s) to ${tableName}`);
            for (const col of newColumns) {
                const safeColName = this._validateAndQuoteIdentifier(col.name);
                const addColumnQuery = `ALTER TABLE ${safeTableName} ADD COLUMN ${safeColName} ${col.type}`;
                this.db.exec(addColumnQuery);
                console.log(`[DB Sync] Added column ${col.name} to ${tableName}`);
            }
        }

        if (tableSchema.constraints && tableSchema.constraints.length > 0) {
            console.log(`[DB Sync] Note: Constraints for ${tableName} can only be set during table creation`);
        }
    }

    runQuery(query, params = []) {
        return this.db.prepare(query).run(params);
    }

    cleanupEmptySessions() {
        console.log('[DB Cleanup] Checking for empty sessions...');
        const query = `
            SELECT s.id FROM sessions s
            LEFT JOIN transcripts t ON s.id = t.session_id
            LEFT JOIN ai_messages a ON s.id = a.session_id
            LEFT JOIN summaries su ON s.id = su.session_id
            WHERE t.id IS NULL AND a.id IS NULL AND su.session_id IS NULL
        `;

        const rows = this.db.prepare(query).all();

        if (rows.length === 0) {
            console.log('[DB Cleanup] No empty sessions found.');
            return;
        }

        const idsToDelete = rows.map(r => r.id);
        const placeholders = idsToDelete.map(() => '?').join(',');
        const deleteQuery = `DELETE FROM sessions WHERE id IN (${placeholders})`;

        console.log(`[DB Cleanup] Found ${idsToDelete.length} empty sessions. Deleting...`);
        const result = this.db.prepare(deleteQuery).run(idsToDelete);
        console.log(`[DB Cleanup] Successfully deleted ${result.changes} empty sessions.`);
    }

    async initTables() {
        await this.synchronizeSchema();
        this.initDefaultData();
    }

    initDefaultData() {
        const now = Math.floor(Date.now() / 1000);
        const initUserQuery = `
            INSERT OR IGNORE INTO users (uid, display_name, email, created_at)
            VALUES (?, ?, ?, ?)
        `;

        this.db.prepare(initUserQuery).run(this.defaultUserId, 'Default User', 'contact@pickle.com', now);

        this.ensureDefaultAgents();

        console.log('Default data initialized.');
    }

    /**
     * Garante que os playbooks de fábrica existam e estejam com o texto do código.
     * Roda no boot e também depois que o usuário "adota" um padrão (o preset editado
     * muda de id e deixa de ser padrão, liberando o id fixo para o original voltar).
     */
    ensureDefaultAgents() {
        const now = Math.floor(Date.now() / 1000);

        // Agentes padrão do Copiloto V4 (substituem os presets em inglês herdados do Glass).
        const legacyGlassPresetIds = ['school', 'meetings', 'sales', 'recruiting', 'customer-support'];
        this.db.prepare(
            `DELETE FROM prompt_presets WHERE is_default = 1 AND id IN (${legacyGlassPresetIds.map(() => '?').join(',')})`
        ).run(...legacyGlassPresetIds);

        const { profilePrompts } = require('../prompts/promptTemplates.js');

        const prevendaPrompt = `Você apoia um PRÉ-VENDAS (SDR) da V4 Amaral&Co durante uma LIGAÇÃO com o lead. O objetivo desta ligação NÃO é vender: é qualificar o lead e agendar a reunião de diagnóstico com o closer, com dia e horário definidos ainda na ligação.

ROTEIRO DA LIGAÇÃO:
1. ABERTURA (máx. 30s): apresente-se, cite de onde veio o contato do lead (formulário, LeadBroker, indicação) e peça permissão objetiva: "Consigo te explicar em 2 minutos por que liguei — faz sentido?"
2. QUALIFICAÇÃO: descubra segmento, faturamento aproximado, se já investe em marketing (quanto e com quem), qual a principal dor comercial e se quem está na linha é o decisor. Uma pergunta de cada vez.
3. GERAÇÃO DE INTERESSE: conecte a dor declarada ao que a reunião de diagnóstico entrega ("nessa reunião a gente analisa seus números e te mostra onde está o vazamento"). Não apresente proposta, preço ou escopo — isso é papel do closer na reunião.
4. AGENDAMENTO: ofereça duas opções fechadas de horário ("terça às 10h ou quarta às 15h?"). Confirme e-mail para o convite e reforce o compromisso ("posso contar com você nesse horário?").

CONTORNO DE OBJEÇÕES DA LIGAÇÃO:
- "Me manda por WhatsApp/e-mail" → "Te mando sim, mas o material genérico não mostra o seu cenário — por isso a reunião de 40 minutos vale mais que qualquer PDF. Qual horário fica melhor?"
- "Não tenho interesse" → pergunte uma vez o motivo real (já tem agência? momento? experiência ruim?) e trate só essa objeção; se mantiver, agradeça e encerre com porta aberta.
- "Quanto custa?" → "Depende do seu cenário — é exatamente isso que o especialista avalia na reunião, sem compromisso. Posso agendar?"
- "Estou sem tempo agora" → seja direto: proponha já o agendamento ("então deixa eu ser rápido: qual dia dessa semana fica melhor pra uma conversa de 40 min?").

REGRAS:
- Sinal de compra ou lead qualificado e receptivo → vá direto para o agendamento, sem alongar a qualificação.
- Use os dados que o lead declarou; NUNCA invente números ou promessas de resultado.`;

        const defaultAgents = [
            ['v4-closer-reuniao', 'Closer — Reunião (Playbook V4)', profilePrompts.v4_sales_copilot.content],
            ['v4-prevenda-ligacao', 'Pré-venda — Ligação', prevendaPrompt],
        ];

        const insertAgent = this.db.prepare(`
            INSERT OR IGNORE INTO prompt_presets (id, uid, title, prompt, is_default, created_at)
            VALUES (?, ?, ?, ?, 1, ?)
        `);
        // Só reescreve o que ainda é padrão. A versão que o usuário adotou tem outro
        // id e is_default = 0, então nunca é sobrescrita por esta ressincronização.
        const refreshAgent = this.db.prepare(`UPDATE prompt_presets SET title = ?, prompt = ? WHERE id = ? AND is_default = 1`);

        for (const [id, title, promptText] of defaultAgents) {
            insertAgent.run(id, this.defaultUserId, title, promptText, now);
            refreshAgent.run(title, promptText, id);
        }
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('SQLite connection closed.');
            } catch (err) {
                console.error('SQLite connection close failed:', err);
            }
            this.db = null;
        }
    }

    query(sql, params = []) {
        if (!this.db) {
            throw new Error('Database not connected');
        }

        try {
            if (sql.toUpperCase().startsWith('SELECT')) {
                return this.db.prepare(sql).all(params);
            } else {
                const result = this.db.prepare(sql).run(params);
                return { changes: result.changes, lastID: result.lastID };
            }
        } catch (err) {
            console.error('Query error:', err);
            throw err;
        }
    }
}

const sqliteClient = new SQLiteClient();
module.exports = sqliteClient; 
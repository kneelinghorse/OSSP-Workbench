import fs from 'fs/promises';
import { execSync } from 'child_process';

async function migrate() {
    console.log('🚀 Starting CMOS History Migration...');

    const contextPath = './cmos-old/PROJECT_CONTEXT.json';
    const dbPath = './cmos/db/cmos.sqlite';

    const context = JSON.parse(await fs.readFile(contextPath, 'utf8'));
    const domains = context.working_memory?.domains || {};

    let totalMissions = 0;
    const sprints = new Set();
    const missions = [];

    const mapToSprint = (id) => {
        const match = id.match(/B(\d+)\./);
        return match ? `sprint-${match[1]}` : 'sprint-unknown';
    };

    for (const [domain, domainData] of Object.entries(domains)) {
        if (!domainData.missions) continue;

        for (const [id, m] of Object.entries(domainData.missions)) {
            const sprintId = mapToSprint(id);
            sprints.add(sprintId);

            missions.push({
                missionId: id,
                name: m.name,
                sprintId: sprintId,
                status: m.status === 'complete' ? 'Completed' : 'Queued',
                objective: `Migrated from legacy project context (Domain: ${domain})`,
                successCriteria: '[]',
                deliverables: '[]',
                completed: m.completed || null
            });
            totalMissions++;
        }
    }

    console.log(`📊 Found ${sprints.size} sprints and ${totalMissions} missions.`);

    let sql = 'BEGIN TRANSACTION;\n';

    for (const sprintId of sprints) {
        sql += `INSERT OR IGNORE INTO sprints (id, title, status) VALUES ('${sprintId}', '${sprintId.replace('sprint-', 'Sprint ')}', 'Completed');\n`;
    }

    for (const m of missions) {
        const escapedName = m.name.replace(/'/g, "''");
        sql += `INSERT OR IGNORE INTO missions (id, name, sprint_id, status, objective, success_criteria, deliverables, completed_at, notes) 
                VALUES ('${m.missionId}', '${escapedName}', '${m.sprintId}', '${m.status}', '${m.objective}', '${m.successCriteria}', '${m.deliverables}', '${m.completed}', 'Migrated from legacy');\n`;
    }

    sql += 'COMMIT;';

    const tempSqlPath = './scripts/cmos-migration/migration.sql';
    await fs.writeFile(tempSqlPath, sql);

    try {
        execSync(`sqlite3 ${dbPath} < ${tempSqlPath}`);
        console.log('✅ Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await fs.unlink(tempSqlPath);
    }
}

migrate().catch(console.error);

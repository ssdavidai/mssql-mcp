import sql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

// Globals for connection and token reuse
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

// Function to create SQL config with SQL authentication
export async function createSqlConfig(): Promise<{ config: sql.config }> {
  const trustServerCertificate = process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true';
  const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;

  return {
    config: {
      server: process.env.SERVER_NAME!,
      database: process.env.DATABASE_NAME!,
      authentication: {
        type: 'default',
        options: {
          userName: process.env.SQL_USERNAME!,
          password: process.env.SQL_PASSWORD!,
        },
      },
      options: {
        encrypt: true,
        trustServerCertificate,
      },
      connectionTimeout: connectionTimeout * 1000, // convert seconds to milliseconds
    }
  };
}

// Connect to SQL only when handling a request
export async function ensureSqlConnection() {
  if (globalSqlPool && globalSqlPool.connected) {
    return;
  }
  const { config } = await createSqlConfig();
  if (globalSqlPool && globalSqlPool.connected) {
    await globalSqlPool.close();
  }
  globalSqlPool = await sql.connect(config);
}

// Patch all tool handlers to ensure SQL connection before running
export function wrapToolRun(tool: { run: (...args: any[]) => Promise<any> }) {
  const originalRun = tool.run.bind(tool);
  tool.run = async function (...args: any[]) {
    await ensureSqlConnection();
    return originalRun(...args);
  };
}
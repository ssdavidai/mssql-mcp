#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

// Import existing tools
import { UpdateDataTool } from './tools/UpdateDataTool.js';
import { InsertDataTool } from './tools/InsertDataTool.js';
import { ReadDataTool } from './tools/ReadDataTool.js';
import { CreateTableTool } from './tools/CreateTableTool.js';
import { CreateIndexTool } from './tools/CreateIndexTool.js';
import { ListTableTool } from './tools/ListTableTool.js';
import { DropTableTool } from './tools/DropTableTool.js';
import { DescribeTableTool } from './tools/DescribeTableTool.js';

// Import SQL connection logic
import { ensureSqlConnection, wrapToolRun } from './sql-connection.js';

dotenv.config();

// Initialize tools
const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

// Wrap tools with SQL connection
[insertDataTool, readDataTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool, describeTableTool].forEach(wrapToolRun);

// Read READONLY env variable
const isReadOnly = process.env.READONLY === 'true';

// Create Express app
const app = express();
const PORT = process.env.HTTP_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Create MCP server instance
const mcpServer = new Server(
  {
    name: 'mssql-mcp-http-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Configure MCP request handlers
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: isReadOnly
    ? [listTableTool, readDataTool, describeTableTool]
    : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool],
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case insertDataTool.name:
        result = await insertDataTool.run(args);
        break;
      case readDataTool.name:
        result = await readDataTool.run(args);
        break;
      case updateDataTool.name:
        result = await updateDataTool.run(args);
        break;
      case createTableTool.name:
        result = await createTableTool.run(args);
        break;
      case createIndexTool.name:
        result = await createIndexTool.run(args);
        break;
      case listTableTool.name:
        result = await listTableTool.run(args);
        break;
      case dropTableTool.name:
        result = await dropTableTool.run(args);
        break;
      case describeTableTool.name:
        if (!args || typeof args.tableName !== 'string') {
          return {
            content: [{ type: 'text', text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
            isError: true,
          };
        }
        result = await describeTableTool.run(args as { tableName: string });
        break;
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error occurred: ${error}` }],
      isError: true,
    };
  }
});

// HTTP Endpoints

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', readonly: isReadOnly });
});

// List available tools
app.get('/tools', async (req, res) => {
  try {
    const tools = isReadOnly
      ? [listTableTool, readDataTool, describeTableTool]
      : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool];
    
    res.json({
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute tool with standard JSON response
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    const request = {
      params: {
        name: toolName,
        arguments: args
      }
    };

    const result = await mcpServer.handleRequest(CallToolRequestSchema, request);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute tool with Server-Sent Events (streaming)
app.post('/tools/:toolName/stream', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable Nginx buffering
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to stream' })}\n\n`);

  try {
    // Send processing event
    res.write(`event: processing\ndata: ${JSON.stringify({ toolName, args })}\n\n`);

    const request = {
      params: {
        name: toolName,
        arguments: args
      }
    };

    // Execute the tool
    const result = await mcpServer.handleRequest(CallToolRequestSchema, request);

    // Stream the result
    if (result.content && Array.isArray(result.content)) {
      for (const content of result.content) {
        if (content.type === 'text') {
          // Parse the JSON result and stream it line by line for large results
          try {
            const parsedData = JSON.parse(content.text);
            
            // If it's an array of results, stream each item
            if (Array.isArray(parsedData)) {
              res.write(`event: result-count\ndata: ${JSON.stringify({ count: parsedData.length })}\n\n`);
              
              for (let i = 0; i < parsedData.length; i++) {
                res.write(`event: result-item\ndata: ${JSON.stringify({ 
                  index: i, 
                  total: parsedData.length,
                  item: parsedData[i] 
                })}\n\n`);
                
                // Small delay to demonstrate streaming
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            } else {
              // Single result
              res.write(`event: result\ndata: ${JSON.stringify(parsedData)}\n\n`);
            }
          } catch (parseError) {
            // If not JSON, send as plain text
            res.write(`event: result\ndata: ${JSON.stringify({ text: content.text })}\n\n`);
          }
        }
      }
    }

    // Send completion event
    res.write(`event: complete\ndata: ${JSON.stringify({ 
      success: !result.isError,
      isError: result.isError 
    })}\n\n`);

  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`MSSQL MCP HTTP Server running on http://localhost:${PORT}`);
  console.log(`Read-only mode: ${isReadOnly}`);
  console.log('\nAvailable endpoints:');
  console.log(`  GET  /health              - Health check`);
  console.log(`  GET  /tools               - List available tools`);
  console.log(`  POST /tools/:toolName     - Execute tool (JSON response)`);
  console.log(`  POST /tools/:toolName/stream - Execute tool (SSE stream)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});
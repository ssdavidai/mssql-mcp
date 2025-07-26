#!/usr/bin/env node

import fetch from 'node-fetch';
import { EventSource } from 'eventsource';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Example 1: List available tools
async function listTools() {
    console.log('\n=== Listing Available Tools ===');
    try {
        const response = await fetch(`${SERVER_URL}/tools`);
        const data = await response.json();
        
        console.log(`Found ${data.tools.length} tools:`);
        data.tools.forEach(tool => {
            console.log(`- ${tool.name}: ${tool.description}`);
        });
        
        return data.tools;
    } catch (error) {
        console.error('Error listing tools:', error.message);
        return [];
    }
}

// Example 2: Execute tool with JSON response
async function executeToolJSON(toolName, args) {
    console.log(`\n=== Executing ${toolName} (JSON Response) ===`);
    console.log('Arguments:', args);
    
    try {
        const response = await fetch(`${SERVER_URL}/tools/${toolName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(args)
        });
        
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
        
        return data;
    } catch (error) {
        console.error('Error executing tool:', error.message);
        return null;
    }
}

// Example 3: Execute tool with SSE streaming
async function executeToolStream(toolName, args) {
    console.log(`\n=== Executing ${toolName} (SSE Stream) ===`);
    console.log('Arguments:', args);
    
    return new Promise((resolve, reject) => {
        const results = [];
        
        // First make the POST request
        fetch(`${SERVER_URL}/tools/${toolName}/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(args)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Read the SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            const processChunk = async () => {
                try {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        resolve(results);
                        return;
                    }
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    
                    // Keep the last incomplete line in the buffer
                    buffer = lines.pop() || '';
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        
                        if (line.startsWith('event:')) {
                            const event = line.substring(6).trim();
                            const nextLine = lines[++i];
                            
                            if (nextLine && nextLine.startsWith('data:')) {
                                const data = JSON.parse(nextLine.substring(5).trim());
                                
                                switch (event) {
                                    case 'connected':
                                        console.log('✓ Connected to stream');
                                        break;
                                    case 'processing':
                                        console.log('⏳ Processing request...');
                                        break;
                                    case 'result-count':
                                        console.log(`📊 Expecting ${data.count} results`);
                                        break;
                                    case 'result-item':
                                        console.log(`📝 Item ${data.index + 1}/${data.total}:`, data.item);
                                        results.push(data.item);
                                        break;
                                    case 'result':
                                        console.log('📋 Result:', data);
                                        results.push(data);
                                        break;
                                    case 'complete':
                                        console.log(`✅ Stream completed (success: ${data.success})`);
                                        break;
                                    case 'error':
                                        console.error('❌ Error:', data.error);
                                        break;
                                    default:
                                        console.log(`📨 ${event}:`, data);
                                }
                            }
                        }
                    }
                    
                    // Continue reading
                    processChunk();
                } catch (error) {
                    reject(error);
                }
            };
            
            processChunk();
        }).catch(reject);
    });
}

// Example usage
async function main() {
    console.log(`Connecting to MSSQL MCP HTTP Server at ${SERVER_URL}`);
    
    // Check server health
    try {
        const healthResponse = await fetch(`${SERVER_URL}/health`);
        const health = await healthResponse.json();
        console.log('Server status:', health);
    } catch (error) {
        console.error('Failed to connect to server:', error.message);
        process.exit(1);
    }
    
    // List tools
    const tools = await listTools();
    
    // Example: List tables (JSON response)
    await executeToolJSON('list_table', {});
    
    // Example: Read data from a table (SSE streaming)
    // This is useful for large result sets
    await executeToolStream('read_data', {
        tableName: 'users',
        limit: 10
    });
    
    // Example: Describe table structure
    await executeToolJSON('describe_table', {
        tableName: 'users'
    });
}

// Run the examples
main().catch(console.error);
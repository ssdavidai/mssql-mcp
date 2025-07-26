# MSSQL MCP HTTP Server

This extension adds HTTP/SSE (Server-Sent Events) streaming capabilities to the MSSQL MCP server, allowing it to be accessed via HTTP endpoints instead of just stdio.

## Features

- **RESTful HTTP API**: Standard JSON request/response for all MCP tools
- **Server-Sent Events (SSE)**: Stream large result sets in real-time
- **CORS Support**: Access from web browsers
- **Maintains MCP Compatibility**: All existing tools work seamlessly

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables in your `.env` file:

```env
# Existing MSSQL configuration
SERVER_NAME=your-server
DATABASE_NAME=your-database
SQL_USERNAME=your-username
SQL_PASSWORD=your-password
TRUST_SERVER_CERTIFICATE=true
CONNECTION_TIMEOUT=30
READONLY=false

# HTTP server configuration
HTTP_PORT=3000  # Optional, defaults to 3000
```

## Running the HTTP Server

```bash
npm run start:http
```

The server will start on `http://localhost:3000` (or your configured port).

## API Endpoints

### 1. Health Check
```
GET /health
```

Returns server status and configuration:
```json
{
  "status": "ok",
  "readonly": false
}
```

### 2. List Available Tools
```
GET /tools
```

Returns all available tools with their schemas:
```json
{
  "tools": [
    {
      "name": "read_data",
      "description": "Read data from a SQL Server table",
      "inputSchema": { ... }
    },
    ...
  ]
}
```

### 3. Execute Tool (JSON Response)
```
POST /tools/:toolName
Content-Type: application/json

{
  "tableName": "users",
  "limit": 10
}
```

Returns the tool execution result as JSON.

### 4. Execute Tool (SSE Stream)
```
POST /tools/:toolName/stream
Content-Type: application/json

{
  "tableName": "users",
  "limit": 1000
}
```

Returns results as a stream of Server-Sent Events. Useful for large result sets.

## SSE Event Types

When using the streaming endpoint, you'll receive the following events:

- `connected`: Initial connection established
- `processing`: Request is being processed
- `result-count`: Total number of results (for array responses)
- `result-item`: Individual result item (for array responses)
- `result`: Complete result (for non-array responses)
- `complete`: Stream completed successfully
- `error`: Error occurred during processing

## Example Usage

### Using cURL

```bash
# List tools
curl http://localhost:3000/tools

# Execute tool with JSON response
curl -X POST http://localhost:3000/tools/list_table \
  -H "Content-Type: application/json" \
  -d '{}'

# Execute tool with SSE streaming
curl -X POST http://localhost:3000/tools/read_data/stream \
  -H "Content-Type: application/json" \
  -d '{"tableName": "users", "limit": 100}'
```

### Using the Web Client

Open `examples/http-client.html` in a web browser for an interactive interface.

### Using Node.js

```javascript
import fetch from 'node-fetch';

// JSON response
const response = await fetch('http://localhost:3000/tools/read_data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tableName: 'users', limit: 10 })
});
const data = await response.json();

// SSE streaming - see examples/http-client.js for full implementation
```

## Security Considerations

1. **Authentication**: The current implementation doesn't include authentication. Consider adding:
   - API key authentication
   - JWT tokens
   - OAuth2

2. **CORS**: Currently allows all origins. In production, configure specific allowed origins.

3. **Rate Limiting**: Consider adding rate limiting for production use.

4. **HTTPS**: Use HTTPS in production environments.

## Advantages of HTTP/SSE

1. **Language Agnostic**: Any programming language can consume the API
2. **Web Browser Support**: Direct access from web applications
3. **Streaming**: Handle large result sets without memory issues
4. **Standard Protocols**: Uses standard HTTP/SSE, no special clients needed
5. **Easy Integration**: Simple to integrate with existing web services

## Comparison with stdio MCP

| Feature | stdio MCP | HTTP/SSE |
|---------|-----------|----------|
| Protocol | Custom MCP over stdio | HTTP + SSE |
| Language Support | Requires MCP SDK | Any HTTP client |
| Streaming | Via MCP protocol | Server-Sent Events |
| Web Browser | Not directly | Yes |
| Authentication | N/A | Can be added |
| Network Access | Local only | Network/Internet |

## Adding Authentication (Example)

To add basic API key authentication, modify `http-server.ts`:

```typescript
// Add middleware
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

## Future Enhancements

1. WebSocket support for bidirectional streaming
2. GraphQL endpoint
3. OpenAPI/Swagger documentation
4. Metrics and monitoring endpoints
5. Request/response logging
6. Connection pooling optimization
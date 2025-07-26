#!/bin/bash

# Get the port from environment variable, default to 8000
PORT=${PORT:-8000}

echo "Starting FastAPI server on port $PORT"

# Start the uvicorn server
exec uvicorn main:app --host 0.0.0.0 --port $PORT 
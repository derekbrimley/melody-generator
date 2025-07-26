#!/usr/bin/env python3
import os
import uvicorn

if __name__ == "__main__":
    # Get port from environment variable, default to 8000
    port = int(os.environ.get("PORT", 8000))
    
    print(f"Starting FastAPI server on port {port}")
    
    # Start the server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False
    ) 
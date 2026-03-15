from fastapi import FastAPI

app = FastAPI(title="VoiceCraft Agent API")


@app.get("/health")
async def health():
    return {"status": "ok"}

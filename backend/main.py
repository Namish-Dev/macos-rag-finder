from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Header, Depends
from database import cursor , conn


load_dotenv()

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, world"}

class LoginRequest(BaseModel):
    password: str

class CreateFolderRequest(BaseModel):
    title: str

def create_token():
    payload = {
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET"), algorithm="HS256")

@app.post("/login")
def login(payload: LoginRequest):
    if payload.password != os.getenv("ACCESS_PASSWORD"):
        raise HTTPException(status_code=401, detail="Incorrect password")

    token = create_token()
    return {"token": token}

def verify_token(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")

    try:
        jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@app.get("/protected")
def protected_route(authorized: None = Depends(verify_token)):
    return {"message": "You have access!"}


@app.get("/folders")
def list_folders(authorized: None = Depends(verify_token)):
    cursor.execute("SELECT id, title FROM folders ORDER BY title")
    rows = cursor.fetchall()

    return [{"id": row[0], "title": row[1]} for row in rows]

@app.post("/folders")
def create_folder(folder:CreateFolderRequest , authorized : None =Depends(verify_token)):
    cursor.execute("INSERT INTO folders (title) VALUES (?)",(folder.title,))
    conn.commit()
    return {"message":"Folder created successfully"}
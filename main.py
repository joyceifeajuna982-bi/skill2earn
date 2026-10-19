import os
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(
    title="Skill2Earn API",
    description="Unified API & Frontend for Skill2Earn",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup directories safely for Vercel (read-only file system handling)
IS_VERCEL = os.environ.get("VERCEL", "0") == "1"
BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = Path("/tmp") if IS_VERCEL else BASE_DIR

UPLOAD_DIR = STORAGE_DIR / "uploads"
DB_FILE = STORAGE_DIR / "posts.json"

# Check multiple possible public directory locations for local vs Vercel bundling
POSSIBLE_PUBLIC_DIRS = [
    BASE_DIR / "public",
    Path("/var/task/public"),
    Path("./public")
]

def get_public_dir():
    for d in POSSIBLE_PUBLIC_DIRS:
        if (d / "index.html").exists():
            return d
    return BASE_DIR / "public"

PUBLIC_DIR = get_public_dir()

# Safely create upload directory without throwing read-only system errors
try:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

def load_posts_db() -> list:
    if DB_FILE.exists():
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def save_posts_db(posts: list):
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving database: {e}")

posts_db = load_posts_db()
jobs_db = [
    {
        "id": "job-1",
        "title": "Frontend React & Tailwind Developer",
        "company": "Vercel Ecosystem Partner",
        "location": "Remote",
        "type": "Full-time",
        "badges": ["React", "Tailwind", "Remote"],
        "description": "Build blazing-fast web applications and creator tools used by thousands worldwide.",
        "source": "Skill2Earn Opportunities"
    },
    {
        "id": "job-2",
        "title": "UI/UX Creator & Brand Designer",
        "company": "CreatorHub Studio",
        "location": "Remote",
        "type": "Contract",
        "badges": ["Figma", "UI/UX", "Design Systems"],
        "description": "Design intuitive mobile and desktop layouts for community-driven educational platforms.",
        "source": "Skill2Earn Opportunities"
    }
]

class PostCreate(BaseModel):
    content: str = ""
    author_name: str = "Community member"
    category: str = "Community"

class CommentCreate(BaseModel):
    content: str
    author_name: str = "Community member"

def current_time():
    return datetime.now(timezone.utc).isoformat()

def find_post(post_id: str):
    for post in posts_db:
        if str(post["id"]) == str(post_id):
            return post
    return None

def safe_filename(original_name: str) -> str:
    suffix = Path(original_name or "").suffix.lower()
    if len(suffix) > 15:
        suffix = ""
    return f"{uuid.uuid4().hex}{suffix}"

def make_post(
    content: str,
    author_name: str,
    category: str,
    media_url: str = "",
    media_type: str = "",
):
    post = {
        "id": uuid.uuid4().hex,
        "author_name": author_name.strip() or "Community member",
        "content": content.strip(),
        "category": category.strip() or "Community",
        "media_url": media_url,
        "media_type": media_type,
        "created_at": current_time(),
        "likes_count": 0,
        "comments": [],
    }
    posts_db.insert(0, post)
    save_posts_db(posts_db)
    return post

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Skill2Earn API"}

@app.post("/api/posts")
def create_post(data: PostCreate):
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Write something before publishing.")
    return make_post(data.content, data.author_name, data.category)

@app.post("/api/upload")
async def upload_media(
    file: UploadFile = File(...),
    content: str = Form(""),
    author_name: str = Form(""),
    category: str = Form("Community"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file was selected.")

    original_name = Path(file.filename).name
    extension = Path(original_name).suffix.lower()
    allowed_extensions = {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
        ".mp4", ".webm", ".mov", ".m4v",
    }
    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    filename = safe_filename(original_name)
    destination = UPLOAD_DIR / filename
    
    with destination.open("wb") as output:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
    await file.close()

    media_type = "video" if (file.content_type or "").startswith("video/") or extension in {".mp4", ".webm", ".mov", ".m4v"} else "image"

    post = make_post(
        content=content,
        author_name=author_name or "Community member",
        category=category,
        media_url=f"/uploads/{filename}",
        media_type=media_type,
    )
    return {"status": "success", "post": post}

@app.get("/api/posts")
def get_posts(skip: int = 0, limit: int = 50):
    return posts_db[skip:skip + limit]

@app.post("/api/posts/{post_id}/like")
def toggle_like(post_id: str):
    post = find_post(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    post["likes_count"] += 1
    save_posts_db(posts_db)
    return {"status": "success", "likes_count": post["likes_count"]}

@app.post("/api/posts/{post_id}/comments")
def add_comment(post_id: str, data: CommentCreate):
    post = find_post(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    comment = {
        "id": uuid.uuid4().hex,
        "author_name": data.author_name.strip() or "Community member",
        "content": data.content.strip(),
        "created_at": current_time(),
    }
    post["comments"].append(comment)
    save_posts_db(posts_db)
    return {"status": "success", "comment": comment, "comments_count": len(post["comments"])}

@app.get("/api/jobs")
def get_jobs():
    return jobs_db

# Mount static folders safely
if UPLOAD_DIR.exists():
    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
if PUBLIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR)), name="static")

@app.get("/")
def serve_index():
    index_file = PUBLIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Skill2Earn API is running."}

@app.exception_handler(404)
async def custom_404_handler(request, __):
    if request.url.path.startswith("/api/"):
        return {"detail": "API endpoint not found."}
    index_file = PUBLIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"detail": "Not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5501, reload=True)
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_password_hash, verify_password
from ..database import Base, get_db
from ..models import PatientProfile, User

router = APIRouter()


class FamilyAccessLink(Base):
    __tablename__ = "family_account_access_links_v1"

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    member_name = Column(String(255), nullable=False)
    relationship = Column(String(100), nullable=False)
    member_email = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    verified_at = Column(DateTime, default=datetime.utcnow)


class AddFamilyMemberRequest(BaseModel):
    member_name: str
    relationship: str
    email: EmailStr
    password: str


def serialize_link(db: Session, link: FamilyAccessLink) -> dict:
    owner = db.query(User).filter(User.id == link.owner_user_id).first()
    target = db.query(User).filter(User.id == link.target_user_id).first()
    return {
        "id": link.id,
        "owner_user_id": link.owner_user_id,
        "owner_email": owner.email if owner else None,
        "owner_name": owner.display_name if owner and owner.display_name else (owner.email if owner else None),
        "target_user_id": link.target_user_id,
        "target_email": target.email if target else link.member_email,
        "target_name": target.display_name if target and target.display_name else link.member_name,
        "relationship": link.relationship,
        "member_email": link.member_email,
        "status": link.status,
        "created_at": link.created_at.isoformat() if link.created_at else None,
        "verified_at": link.verified_at.isoformat() if link.verified_at else None,
    }


def get_outgoing_links(db: Session, user: User) -> list[FamilyAccessLink]:
    return db.query(FamilyAccessLink).filter(
        FamilyAccessLink.owner_user_id == user.id,
        FamilyAccessLink.status == "active"
    ).order_by(FamilyAccessLink.created_at.asc()).all()


@router.post("/add-member")
def add_family_member(
    body: AddFamilyMemberRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "patient":
        return {"success": False, "error": "Only patient accounts can manage family mode"}

    member_name = body.member_name.strip()
    relationship = body.relationship.strip()
    member_email = body.email.strip().lower()
    password = body.password.strip()

    if not member_name:
        return {"success": False, "error": "Member name is required"}
    if not relationship:
        return {"success": False, "error": "Relationship is required"}
    if not password:
        return {"success": False, "error": "Password is required"}
    if member_email == current_user.email.lower():
        return {"success": False, "error": "You cannot add your own account as a family member"}

    target_user = db.query(User).filter(func.lower(User.email) == member_email).first()
    created_account = False

    if target_user:
        if target_user.role != "patient":
            return {"success": False, "error": "Only patient accounts can be linked in family mode"}
        if not verify_password(password, target_user.hashed_password):
            return {"success": False, "error": "Invalid member credentials"}
    else:
        target_user = User(
            email=member_email,
            hashed_password=get_password_hash(password),
            role="patient",
            display_name=member_name,
        )
        db.add(target_user)
        db.commit()
        db.refresh(target_user)
        db.add(PatientProfile(user_id=target_user.id))
        db.commit()
        created_account = True

    link = db.query(FamilyAccessLink).filter(
        FamilyAccessLink.owner_user_id == current_user.id,
        FamilyAccessLink.target_user_id == target_user.id
    ).first()

    if link:
        link.member_name = member_name
        link.relationship = relationship
        link.member_email = member_email
        link.status = "active"
        link.verified_at = datetime.utcnow()
    else:
        link = FamilyAccessLink(
            owner_user_id=current_user.id,
            target_user_id=target_user.id,
            member_name=member_name,
            relationship=relationship,
            member_email=member_email,
            status="active",
            verified_at=datetime.utcnow(),
        )
        db.add(link)

    db.commit()
    db.refresh(link)

    return {
        "success": True,
        "data": {
            "link": serialize_link(db, link),
            "created_account": created_account,
        },
        "error": None,
    }


@router.get("/list")
def list_family_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    links = get_outgoing_links(db, current_user)
    return {"success": True, "data": [serialize_link(db, link) for link in links], "error": None}


@router.get("/accessed-by")
def list_accessed_by(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    links = db.query(FamilyAccessLink).filter(
        FamilyAccessLink.target_user_id == current_user.id,
        FamilyAccessLink.status == "active"
    ).order_by(FamilyAccessLink.created_at.asc()).all()
    return {"success": True, "data": [serialize_link(db, link) for link in links], "error": None}


@router.get("/context")
def family_context(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    managed_by = db.query(FamilyAccessLink).filter(
        FamilyAccessLink.target_user_id == current_user.id,
        FamilyAccessLink.status == "active"
    ).order_by(FamilyAccessLink.created_at.asc()).all()
    return {
        "success": True,
        "data": {
            "managed_by": [serialize_link(db, link) for link in managed_by],
        },
        "error": None,
    }


@router.delete("/{link_id}")
def revoke_family_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = db.query(FamilyAccessLink).filter(
        FamilyAccessLink.id == link_id,
        FamilyAccessLink.owner_user_id == current_user.id,
        FamilyAccessLink.status == "active"
    ).first()
    if not link:
        return {"success": False, "error": "Family member link not found"}

    link.status = "revoked"
    db.commit()
    return {"success": True, "data": {"id": link_id}, "error": None}

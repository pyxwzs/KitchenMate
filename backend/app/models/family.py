import enum

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.user import User


class FamilyRole(str, enum.Enum):
    ADMIN = "admin"
    CHEF = "chef"
    DINER = "diner"


class Family(Base, TimestampMixin):
    __tablename__ = "families"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    members: Mapped[list["FamilyMember"]] = relationship(back_populates="family")


class FamilyMember(Base, TimestampMixin):
    __tablename__ = "family_members"
    __table_args__ = (UniqueConstraint("family_id", "user_id", name="uq_family_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    role: Mapped[FamilyRole] = mapped_column(Enum(FamilyRole), default=FamilyRole.DINER, nullable=False)

    family: Mapped["Family"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()

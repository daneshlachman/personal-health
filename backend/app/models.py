import uuid
from datetime import datetime, timezone
from app import db


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    weight_logs = db.relationship("WeightLog", backref="user", lazy=True)
    nutrition_logs = db.relationship("NutritionLog", backref="user", lazy=True)
    whoop_data = db.relationship("WhoopData", backref="user", lazy=True)
    workouts = db.relationship("Workout", backref="user", lazy=True)
    chat_messages = db.relationship("ChatMessage", backref="user", lazy=True)


class WeightLog(db.Model):
    __tablename__ = "weight_logs"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    weight_kg = db.Column(db.Float, nullable=False)
    source = db.Column(db.String(50))  # 'whoop', 'manual', 'import'
    photo_data = db.Column(db.Text)    # base64 encoded image
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "weight_kg": self.weight_kg,
            "source": self.source,
            "photo_data": self.photo_data,
            "created_at": self.created_at.isoformat(),
        }


class NutritionLog(db.Model):
    __tablename__ = "nutrition_logs"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    meal_type = db.Column(db.String(50))  # 'breakfast', 'lunch', 'dinner', 'snack'
    description = db.Column(db.Text, nullable=False)
    calories = db.Column(db.Integer)
    protein_g = db.Column(db.Float)
    carbs_g = db.Column(db.Float)
    fat_g = db.Column(db.Float)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "meal_type": self.meal_type,
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g,
            "created_at": self.created_at.isoformat(),
        }


class WhoopData(db.Model):
    __tablename__ = "whoop_data"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    recovery_score = db.Column(db.Integer)
    hrv_ms = db.Column(db.Float)
    resting_hr = db.Column(db.Integer)
    respiratory_rate = db.Column(db.Float)
    sleep_score = db.Column(db.Integer)
    sleep_duration_hours = db.Column(db.Float)
    sleep_needed_hours = db.Column(db.Float)
    sleep_consistency_pct = db.Column(db.Integer)
    sleep_efficiency_pct = db.Column(db.Integer)
    sleep_disturbances = db.Column(db.Integer)
    step_count = db.Column(db.Integer)
    raw_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "recovery_score": self.recovery_score,
            "hrv_ms": self.hrv_ms,
            "resting_hr": self.resting_hr,
            "respiratory_rate": self.respiratory_rate,
            "sleep_score": self.sleep_score,
            "sleep_duration_hours": self.sleep_duration_hours,
            "sleep_needed_hours": self.sleep_needed_hours,
            "sleep_consistency_pct": self.sleep_consistency_pct,
            "sleep_efficiency_pct": self.sleep_efficiency_pct,
            "sleep_disturbances": self.sleep_disturbances,
            "step_count": self.step_count,
            "created_at": self.created_at.isoformat(),
        }


class Workout(db.Model):
    __tablename__ = "workouts"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    source = db.Column(db.String(50))  # 'hevy', 'garmin'
    title = db.Column(db.String(255))
    duration_minutes = db.Column(db.Integer)
    raw_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "source": self.source,
            "title": self.title,
            "duration_minutes": self.duration_minutes,
            "created_at": self.created_at.isoformat(),
        }


class UserProfile(db.Model):
    __tablename__ = "user_profiles"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, unique=True)
    height_cm = db.Column(db.Float)
    date_of_birth = db.Column(db.Date)
    gender = db.Column(db.String(10))  # 'male' / 'female'
    avg_daily_steps = db.Column(db.Integer, default=10000)
    calorie_goal = db.Column(db.Integer)
    goals = db.Column(db.Text)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "height_cm": self.height_cm,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "gender": self.gender,
            "avg_daily_steps": self.avg_daily_steps,
            "calorie_goal": self.calorie_goal,
            "goals": self.goals,
        }


class OAuthToken(db.Model):
    __tablename__ = "oauth_tokens"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    provider = db.Column(db.String(50), nullable=False)  # 'whoop'
    access_token = db.Column(db.Text, nullable=False)
    refresh_token = db.Column(db.Text)
    expires_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now)

    __table_args__ = (db.UniqueConstraint("user_id", "provider", name="uq_oauth_user_provider"),)


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    date = db.Column(db.Date, nullable=True)  # which day this message belongs to
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "date": self.date.isoformat() if self.date else None,
            "created_at": self.created_at.isoformat(),
        }


class TrainingRecommendation(db.Model):
    __tablename__ = "training_recommendations"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

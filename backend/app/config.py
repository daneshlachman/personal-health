import os


class BaseConfig:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

    # PostgreSQL
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/healthdb"
    )

    # Shared secret for all /api requests (X-API-Key header or ?key=); unset = no check
    API_KEY = os.environ.get("API_KEY", "")

    # Claude
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

    # Frontend URL (used for OAuth redirects)
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    # Whoop
    WHOOP_CLIENT_ID = os.environ.get("WHOOP_CLIENT_ID", "")
    WHOOP_CLIENT_SECRET = os.environ.get("WHOOP_CLIENT_SECRET", "")
    WHOOP_REDIRECT_URI = os.environ.get("WHOOP_REDIRECT_URI", "")

    # Garmin
    GARMIN_EMAIL = os.environ.get("GARMIN_EMAIL", "")
    GARMIN_PASSWORD = os.environ.get("GARMIN_PASSWORD", "")

    # Hevy
    HEVY_API_KEY = os.environ.get("HEVY_API_KEY", "")

    # USDA FoodData Central (DEMO_KEY werkt zonder registratie, 1000 req/uur)
    USDA_API_KEY = os.environ.get("USDA_API_KEY", "DEMO_KEY")

    # MyFitnessPal
    MFP_USERNAME = os.environ.get("MFP_USERNAME", "")
    MFP_PASSWORD = os.environ.get("MFP_PASSWORD", "")


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class ProductionConfig(BaseConfig):
    DEBUG = False


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}

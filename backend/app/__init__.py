from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()


# Reached without our header: Whoop redirects the browser back here after login
OPEN_PATHS = {"/api/whoop/callback"}


def _require_api_key(app):
    """Every /api request needs the key, as an X-API-Key header or a ?key= query parameter
    (for links and <img> tags that can't send headers). No API_KEY configured = open,
    so a deploy before the key is set doesn't lock anything out."""
    import hmac
    from flask import request

    @app.before_request
    def check_key():
        expected = app.config.get("API_KEY")
        if not expected or request.method == "OPTIONS" or not request.path.startswith("/api/"):
            return None
        if request.path in OPEN_PATHS:
            return None
        given = request.headers.get("X-API-Key") or request.args.get("key") or ""
        if not hmac.compare_digest(given, expected):
            return {"error": "unauthorized"}, 401
        return None


def create_app(config_name=None):
    app = Flask(__name__)

    from app.config import config
    cfg = config.get(config_name or "default")
    app.config.from_object(cfg)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, origins=app.config.get("CORS_ORIGINS", [
        "https://brave-ocean-004361b03.7.azurestaticapps.net",
        "http://localhost:5173",
    ]))

    from app.routes.food import food_bp
    from app.routes.chat import chat_bp
    from app.routes.nutrition import nutrition_bp
    from app.routes.weight import weight_bp
    from app.routes.workouts import workouts_bp
    from app.routes.sync import sync_bp
    from app.routes.whoop_auth import whoop_bp
    from app.routes.profile import profile_bp

    app.register_blueprint(food_bp, url_prefix="/api")
    app.register_blueprint(chat_bp, url_prefix="/api")
    app.register_blueprint(nutrition_bp, url_prefix="/api")
    app.register_blueprint(weight_bp, url_prefix="/api")
    app.register_blueprint(workouts_bp, url_prefix="/api")
    app.register_blueprint(sync_bp, url_prefix="/api")
    app.register_blueprint(whoop_bp, url_prefix="/api")
    app.register_blueprint(profile_bp, url_prefix="/api")

    with app.app_context():
        try:
            db.session.execute(db.text(
                "ALTER TABLE weight_logs ADD COLUMN IF NOT EXISTS photo_data TEXT"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

    _require_api_key(app)

    @app.route("/health")
    def health():
        return {"status": "ok"}, 200

    @app.errorhandler(404)
    def not_found(e):
        return {"error": "Not found"}, 404

    @app.errorhandler(500)
    def server_error(e):
        return {"error": "Internal server error"}, 500

    return app

"""
Application Factory
===================
"""

import traceback
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config.settings import Config
from app.utils.database import get_db, init_indexes
from app.services.auth_service import auth_service


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["SECRET_KEY"] = Config.SECRET_KEY
    app.config["JWT_SECRET_KEY"] = Config.JWT_SECRET_KEY
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = Config.JWT_ACCESS_TOKEN_EXPIRES
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = Config.JWT_REFRESH_TOKEN_EXPIRES

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    JWTManager(app)

    db = get_db()
    init_indexes(db)

    auth_service.ensure_sysadmin(
        username=Config.SYSADMIN_USERNAME,
        password=Config.SYSADMIN_PASSWORD,
    )

    from app.api.auth import bp as auth_bp
    from app.api.users import bp as users_bp
    from app.api.erp import bp as erp_bp
    from app.api.permission_templates import bp as templates_bp
    from app.api.settings import bp as settings_bp
    from app.api.attendance import bp as attendance_bp
    from app.api.leave import bp as leave_bp
    from app.api.deductions import bp as deductions_bp
    from app.api.notifications import bp as notifications_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(erp_bp)
    app.register_blueprint(templates_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(leave_bp)
    app.register_blueprint(deductions_bp)
    app.register_blueprint(notifications_bp)

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "EGC Portal API"}), 200

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Endpoint not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(Exception)
    def internal_error(e):
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return jsonify({"error": e.name, "detail": e.description}), e.code
            
        traceback.print_exc()
        return jsonify({"error": "Internal server error.", "detail": str(e)}), 500

    return app
"""
Permission Nodes Registry
=========================
All permission nodes used across the application are defined here.
"""

AUTH_NODES = {
    "users.view_list": "View all user accounts",
    "users.create": "Create a new user account from ERP employee",
    "users.edit": "Edit user account details",
    "users.deactivate": "Deactivate / reactivate a user account",
    "users.reset_password": "Force-reset a user's password",
    "users.view_permissions": "View a user's permission assignments",
    "users.edit_permissions": "Edit a user's permission assignments",
    "users.assign_template": "Assign a permission template to a user",
}

ERP_NODES = {
    "erp.view_employee_list": "Pull and view employee list from ERPNext",
    "erp.sync_employee": "Sync a specific employee record from ERPNext",
    "erp.manage_project_supervisors": "Assign employees as supervisors for a project site",
}

ATTENDANCE_NODES = {
    "attendance.final_approve": "Give final approval on supervisor-approved attendance submissions, pushing them to egc_hr",
}

DEDUCTION_NODES = {
    "deductions.review": "Review supervisor Deduction Requests and employee appeals, and convert requests into real payroll Deductions",
}

TEMPLATE_NODES = {
    "permission_templates.view": "View permission templates",
    "permission_templates.create": "Create a new permission template",
    "permission_templates.edit": "Edit an existing permission template",
    "permission_templates.delete": "Delete a permission template",
}

SYSTEM_NODES = {
    "system.view_audit_log": "View system audit log",
    "system.manage_settings": "Manage system-wide settings (QR toggle, etc.)",
}

ALL_NODES: dict = {
    **AUTH_NODES,
    **ERP_NODES,
    **ATTENDANCE_NODES,
    **DEDUCTION_NODES,
    **TEMPLATE_NODES,
    **SYSTEM_NODES,
}

SYSADMIN_NODES: set = set(ALL_NODES.keys())

DEFAULT_USER_NODES: set = set()

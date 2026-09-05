"""
Permission Nodes Registry
=========================
All permission nodes used across the application are defined here.
"""

AUTH_NODES = {
    "users.view_list": "View all user accounts",
    "users.create": "Create a new user account from ERP employee",
    "users.deactivate": "Deactivate / reactivate a user account",
    "users.reset_password": "Force-reset a user's password",
    "users.view_permissions": "View a user's permission assignments",
    "users.edit_permissions": "Edit a user's permission assignments",
    "users.assign_template": "Assign a permission template to a user",
}

ERP_NODES = {
    "erp.view_employee_list": "Pull and view employee list from ERPNext",
    "erp.manage_project_supervisors": "Assign employees as supervisors for a project site",
}

ATTENDANCE_NODES = {
    "attendance.final_approve": "Give final approval on supervisor-approved attendance submissions, pushing them to egc_hr",
}

DEDUCTION_NODES = {
    "deductions.review": "Review supervisor Deduction Requests and employee appeals, and convert requests into real payroll Deductions",
}

EXPENSE_CLAIM_NODES = {
    "expense_claims.review": "Process AI extraction and give the first approval on Expense Claim Applications",
    "expense_claims.final_approve": "Give final approval on Accountant-approved Expense Claim Applications, posting them to ERPNext",
    "expense_claims.create_for_employee": "Create an expense claim application on behalf of an employee who has an EGC App account",
}

TEMPLATE_NODES = {
    "permission_templates.view": "View permission templates",
    "permission_templates.create": "Create a new permission template",
    "permission_templates.edit": "Edit an existing permission template",
    "permission_templates.delete": "Delete a permission template",
}

SYSTEM_NODES = {
    "system.manage_settings": "Manage system-wide settings (QR toggle, etc.)",
}

ALL_NODES: dict = {
    **AUTH_NODES,
    **ERP_NODES,
    **ATTENDANCE_NODES,
    **DEDUCTION_NODES,
    **EXPENSE_CLAIM_NODES,
    **TEMPLATE_NODES,
    **SYSTEM_NODES,
}

# Grouping metadata for the Permission Templates editor UI - the frontend
# used to hardcode its own copy of this whole registry (groups and all),
# which drifted out of sync every time a node was added here (it was
# missing every attendance/deductions/expense_claims/project-supervisor
# node, and still listed a fictional timesheet.* group that never
# corresponded to anything actually checked in the app). Exposing the
# grouping here too - not just ALL_NODES - means the frontend never
# hardcodes this catalogue again; see GET /api/permission-templates/nodes.
NODE_GROUPS: list = [
    {"key": "users", "label": "Users", "icon": "users", "nodes": AUTH_NODES},
    {"key": "erp", "label": "ERP", "icon": "link", "nodes": ERP_NODES},
    {"key": "attendance", "label": "Attendance", "icon": "clock", "nodes": ATTENDANCE_NODES},
    {"key": "deductions", "label": "Deductions", "icon": "alertCircle", "nodes": DEDUCTION_NODES},
    {"key": "expense_claims", "label": "Expense Claims", "icon": "creditCard", "nodes": EXPENSE_CLAIM_NODES},
    {"key": "permission_templates", "label": "Permission Templates", "icon": "shield", "nodes": TEMPLATE_NODES},
    {"key": "system", "label": "System", "icon": "key", "nodes": SYSTEM_NODES},
]

SYSADMIN_NODES: set = set(ALL_NODES.keys())

DEFAULT_USER_NODES: set = set()

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
}

TEMPLATE_NODES = {
    "permission_templates.view": "View permission templates",
    "permission_templates.create": "Create a new permission template",
    "permission_templates.edit": "Edit an existing permission template",
    "permission_templates.delete": "Delete a permission template",
}

TIMESHEET_NODES = {
    "timesheet.view_own": "View own timesheet entries and submissions",
    "timesheet.view_all": "View all users timesheet entries and submissions",
    "timesheet.add_record": "Clock in/out via QR scan OR add a manual entry",
    "timesheet.edit_own": "Edit own draft timesheet entries",
    "timesheet.edit_all": "Edit any users timesheet entries",
    "timesheet.delete_own": "Delete own draft timesheet entries",
    "timesheet.delete_all": "Delete any users timesheet entries",
    "timesheet.approve": "Approve or reject timesheet submissions",
    "timesheet.submit_to_erp": "Push approved submissions to ERPNext",
}

SYSTEM_NODES = {
    "system.view_audit_log": "View system audit log",
    "system.manage_settings": "Manage system-wide settings (QR toggle, etc.)",
}

ALL_NODES: dict = {
    **AUTH_NODES,
    **ERP_NODES,
    **TEMPLATE_NODES,
    **TIMESHEET_NODES,
    **SYSTEM_NODES,
}

SYSADMIN_NODES: set = set(ALL_NODES.keys())

DEFAULT_USER_NODES: set = {
    "timesheet.view_own",
    "timesheet.submit",
    "timesheet.edit_own",
}

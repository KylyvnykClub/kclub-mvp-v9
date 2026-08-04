REVOKE ALL ON audit_log FROM app_rw;
DROP TABLE IF EXISTS audit_log;
-- Role app_rw is intentionally NOT dropped: other tables may use it.

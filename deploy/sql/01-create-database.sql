/*
  ApexWMS - one-time database setup for Microsoft SQL Server.
  Run this ONCE in SQL Server Management Studio (SSMS), connected as an administrator
  (Windows login or "sa").  Change the password below first, and use the same password
  as MSSQL_PASSWORD in the service's .env file.

  The service creates its own tables automatically on first start - you do not need to.
*/

USE master;
GO

IF DB_ID(N'ApexWMS') IS NULL
    CREATE DATABASE ApexWMS;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'apex_wms_app')
    CREATE LOGIN apex_wms_app WITH PASSWORD = N'CHANGE_ME_TO_A_LONG_PASSWORD', CHECK_POLICY = ON;
GO

USE ApexWMS;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'apex_wms_app')
    CREATE USER apex_wms_app FOR LOGIN apex_wms_app;
GO

-- Needs to create its own tables, read and write them. Nothing else.
ALTER ROLE db_ddladmin   ADD MEMBER apex_wms_app;
ALTER ROLE db_datareader ADD MEMBER apex_wms_app;
ALTER ROLE db_datawriter ADD MEMBER apex_wms_app;
GO

PRINT 'ApexWMS database and login are ready.';

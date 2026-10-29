/*
  ApexWMS - table creation script for Microsoft SQL Server.

  OPTIONAL. The service creates these same tables by itself the first time it starts
  (it runs this exact structure). Use this script if you want to create or review the
  tables yourself, e.g. with a database login that is not allowed to create tables.

  Run in SSMS after 01-create-database.sql, connected to the ApexWMS database.
  Safe to run more than once: each table is only created if it does not exist.

  Layout: every table has
    Id        the record's key (SKU code, order id, user id, ...)
    Seq       keeps the on-screen order of the list
    <columns> a few readable columns for searching/reporting in SSMS
    Data      the full record as JSON (this is what the app reads)
    UpdatedAt when the row was last saved (UTC)
  Do not edit rows by hand while the service is running; use the app.
*/

USE ApexWMS;
GO

-- Settings kept by the service: role permissions, deleted categories,
-- the "allow negative stock" tick, the sign-in secret and the first-run flag.
IF OBJECT_ID(N'dbo.Meta', N'U') IS NULL
  CREATE TABLE dbo.Meta (
    [K] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [V] NVARCHAR(MAX) NULL
  );
GO

-- skus
IF OBJECT_ID(N'dbo.Skus', N'U') IS NULL
  CREATE TABLE dbo.Skus (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Name] NVARCHAR(300) NULL,
    [Category] NVARCHAR(200) NULL,
    [Barcode] NVARCHAR(100) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Skus_Seq' AND object_id = OBJECT_ID(N'dbo.Skus'))
  CREATE INDEX IX_Skus_Seq ON dbo.Skus ([Seq]);
GO

-- locations
IF OBJECT_ID(N'dbo.Locations', N'U') IS NULL
  CREATE TABLE dbo.Locations (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Aisle] NVARCHAR(20) NULL,
    [Zone] NVARCHAR(100) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Locations_Seq' AND object_id = OBJECT_ID(N'dbo.Locations'))
  CREATE INDEX IX_Locations_Seq ON dbo.Locations ([Seq]);
GO

-- batches
IF OBJECT_ID(N'dbo.Batches', N'U') IS NULL
  CREATE TABLE dbo.Batches (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [BatchNo] NVARCHAR(100) NULL,
    [Sku] NVARCHAR(100) NULL,
    [BestBeforeDate] NVARCHAR(30) NULL,
    [LocationId] NVARCHAR(100) NULL,
    [QuantityOnHand] FLOAT NULL,
    [Status] NVARCHAR(30) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Batches_Seq' AND object_id = OBJECT_ID(N'dbo.Batches'))
  CREATE INDEX IX_Batches_Seq ON dbo.Batches ([Seq]);
GO

-- orders
IF OBJECT_ID(N'dbo.SalesOrders', N'U') IS NULL
  CREATE TABLE dbo.SalesOrders (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [SalesOrderNo] NVARCHAR(100) NULL,
    [CustomerName] NVARCHAR(300) NULL,
    [Status] NVARCHAR(30) NULL,
    [OrderDate] NVARCHAR(30) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SalesOrders_Seq' AND object_id = OBJECT_ID(N'dbo.SalesOrders'))
  CREATE INDEX IX_SalesOrders_Seq ON dbo.SalesOrders ([Seq]);
GO

-- stockMovements
IF OBJECT_ID(N'dbo.StockMovements', N'U') IS NULL
  CREATE TABLE dbo.StockMovements (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Timestamp] NVARCHAR(30) NULL,
    [MovementType] NVARCHAR(40) NULL,
    [Sku] NVARCHAR(100) NULL,
    [BatchNo] NVARCHAR(100) NULL,
    [Quantity] FLOAT NULL,
    [Operator] NVARCHAR(200) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StockMovements_Seq' AND object_id = OBJECT_ID(N'dbo.StockMovements'))
  CREATE INDEX IX_StockMovements_Seq ON dbo.StockMovements ([Seq]);
GO

-- auditLogs
IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
  CREATE TABLE dbo.AuditLogs (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Timestamp] NVARCHAR(30) NULL,
    [UserName] NVARCHAR(200) NULL,
    [ActionType] NVARCHAR(100) NULL,
    [Severity] NVARCHAR(20) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_Seq' AND object_id = OBJECT_ID(N'dbo.AuditLogs'))
  CREATE INDEX IX_AuditLogs_Seq ON dbo.AuditLogs ([Seq]);
GO

-- purchaseOrders
IF OBJECT_ID(N'dbo.PurchaseOrders', N'U') IS NULL
  CREATE TABLE dbo.PurchaseOrders (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Sku] NVARCHAR(100) NULL,
    [Supplier] NVARCHAR(300) NULL,
    [Status] NVARCHAR(30) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PurchaseOrders_Seq' AND object_id = OBJECT_ID(N'dbo.PurchaseOrders'))
  CREATE INDEX IX_PurchaseOrders_Seq ON dbo.PurchaseOrders ([Seq]);
GO

-- users
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
  CREATE TABLE dbo.Users (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Email] NVARCHAR(300) NULL,
    [Name] NVARCHAR(200) NULL,
    [Role] NVARCHAR(40) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_Seq' AND object_id = OBJECT_ID(N'dbo.Users'))
  CREATE INDEX IX_Users_Seq ON dbo.Users ([Seq]);
GO

-- customers
IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
  CREATE TABLE dbo.Customers (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [CustomerCode] NVARCHAR(100) NULL,
    [CompanyName] NVARCHAR(300) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Customers_Seq' AND object_id = OBJECT_ID(N'dbo.Customers'))
  CREATE INDEX IX_Customers_Seq ON dbo.Customers ([Seq]);
GO

-- facilities
IF OBJECT_ID(N'dbo.Facilities', N'U') IS NULL
  CREATE TABLE dbo.Facilities (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Name] NVARCHAR(300) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Facilities_Seq' AND object_id = OBJECT_ID(N'dbo.Facilities'))
  CREATE INDEX IX_Facilities_Seq ON dbo.Facilities ([Seq]);
GO

-- zones
IF OBJECT_ID(N'dbo.Zones', N'U') IS NULL
  CREATE TABLE dbo.Zones (
    [Id] NVARCHAR(100) NOT NULL PRIMARY KEY,
    [Seq] BIGINT NOT NULL,
    [Title] NVARCHAR(300) NULL,
    [Data] NVARCHAR(MAX) NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Zones_Seq' AND object_id = OBJECT_ID(N'dbo.Zones'))
  CREATE INDEX IX_Zones_Seq ON dbo.Zones ([Seq]);
GO


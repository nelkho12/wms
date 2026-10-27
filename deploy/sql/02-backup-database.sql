/*
  Full backup of the ApexWMS database.  Run in SSMS to back up now, or schedule it
  every night with backup-database.bat (Windows Task Scheduler).
  Change the folder if you like; the folder must already exist.
*/
DECLARE @file NVARCHAR(400) =
    N'C:\ApexWMS\backups\ApexWMS_' + FORMAT(SYSDATETIME(), 'yyyyMMdd_HHmm') + N'.bak';

BACKUP DATABASE ApexWMS TO DISK = @file WITH INIT, COMPRESSION, CHECKSUM;
PRINT 'Backup written to ' + @file;

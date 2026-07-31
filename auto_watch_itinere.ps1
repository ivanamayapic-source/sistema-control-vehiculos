# ==========================================================================
# FILE WATCHER: DYNAMIC LATEST-FILE DETECTOR & RE-PROCESSOR FOR ENCUESTA TRANSPORTE IN ITINERE
# ==========================================================================

$watchFolder = "C:\Users\we_ar\.gemini\antigravity\scratch\sistema-control-vehiculos\Base de datos"
$joinScript = "C:\Users\we_ar\.gemini\antigravity\scratch\process_active_workers_join.ps1"

Write-Host "Iniciando servicio de monitoreo automatico dinámico en: $watchFolder"
Write-Host "Cualquier archivo de encuesta nuevo o actualizado (.xlsx/.xls) desencadenará el cruce usando el archivo mas reciente..."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchFolder
$watcher.Filter = "*.xls*"
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    Write-Host "[DETECTADO] Cambio en carpeta de encuesta: $path ($changeType)"
    
    # Wait briefly for file copy/download completion
    Start-Sleep -Seconds 2
    
    try {
        Write-Host "Ejecutando proceso de detección del archivo mas reciente y cruce..."
        powershell -ExecutionPolicy Bypass -File $joinScript
        Write-Host "[EXITO] Base de datos de la encuesta actualizada exitosamente."
    } catch {
        Write-Host "[ERROR] Ocurrio una novedad durante la actualización: $_"
    }
}

Register-ObjectEvent $watcher 'Created' -Action $action | Out-Null
Register-ObjectEvent $watcher 'Changed' -Action $action | Out-Null
Register-ObjectEvent $watcher 'Renamed' -Action $action | Out-Null

Write-Host "Monitoreo dinámico activo. Presione Ctrl+C para finalizar."
while ($true) { Start-Sleep -Seconds 5 }

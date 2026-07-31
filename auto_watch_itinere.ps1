# ==========================================================================
# FILE WATCHER: AUTOMATIC DETECTOR AND RE-PROCESSOR FOR ENCUESTA TRANSPORTE IN ITINERE
# ==========================================================================

$watchFolder = "C:\Users\we_ar\.gemini\antigravity\scratch\sistema-control-vehiculos\Base de datos"
$joinScript = "C:\Users\we_ar\.gemini\antigravity\scratch\process_active_workers_join.ps1"

Write-Host "Iniciando servicio de monitoreo automatico en: $watchFolder"
Write-Host "Cualquier archivo de encuesta nuevo o reemplazado ejecutara automaticamente el cruce..."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchFolder
$watcher.Filter = "*.xlsx"
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    Write-Host "[DETECTADO] Cambio en archivo de encuesta: $path ($changeType)"
    
    # Wait briefly for file write completion
    Start-Sleep -Seconds 2
    
    try {
        Write-Host "Ejecutando proceso de actualizacion automatica y cruce..."
        powershell -ExecutionPolicy Bypass -File $joinScript
        Write-Host "[EXITO] Base de datos actualizada exitosamente."
    } catch {
        Write-Host "[ERROR] Ocurrio una novedad durante el cruce: $_"
    }
}

Register-ObjectEvent $watcher 'Created' -Action $action | Out-Null
Register-ObjectEvent $watcher 'Changed' -Action $action | Out-Null

Write-Host "Monitoreo activo. Presione Ctrl+C para finalizar."
while ($true) { Start-Sleep -Seconds 5 }

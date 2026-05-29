Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = "d:\Kevin\Cosas de la Uni\Universidad Tareas\Modular\Tramites GUIA.docx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
$stream = $entry.Open()
$reader = New-Object IO.StreamReader($stream)
$xml = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()

# Replace <w:p> with a newline
$xml = $xml -replace '<w:p\b[^>]*>', "`r`n"
# Remove all XML tags
$xml = $xml -replace '<[^>]+>', ''

Write-Output $xml

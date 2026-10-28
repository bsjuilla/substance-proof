# Makes a synthetic meeting recording (mono, 16-bit, 16 kHz WAV) with Windows' built-in voices.
# Usage: powershell -NoProfile -File scripts/tts.ps1 -Json lines.json -Out meeting.wav
# lines.json: [{ "voice": 0|1, "pitch": "+0%", "rate": "0%", "text": "..." }, ...]
param([Parameter(Mandatory=$true)][string]$Json, [Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$lines = Get-Content -Raw -Path $Json | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($Out, $fmt)
foreach ($l in $lines) {
  $name = $voices[[int]$l.voice % $voices.Count]
  $text = [System.Security.SecurityElement]::Escape([string]$l.text)
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='$name'><prosody pitch='$($l.pitch)' rate='$($l.rate)'>$text</prosody><break time='700ms'/></voice></speak>"
  $synth.SpeakSsml($ssml)
}
$synth.SetOutputToNull()
$synth.Dispose()
Write-Output "wrote $Out"

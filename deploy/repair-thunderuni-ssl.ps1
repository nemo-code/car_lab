param(
    [string]$Server = '8.156.83.206',
    [string]$User = 'root',
    [string]$CertificateBundle = '..\..\..\8081\证书.txt'
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundlePath = [IO.Path]::GetFullPath((Join-Path $scriptRoot $CertificateBundle))
$nginxPath = Join-Path $scriptRoot 'thunderuni.nginx'

if (-not (Test-Path -LiteralPath $bundlePath -PathType Leaf)) {
    throw "Certificate bundle not found: $bundlePath"
}

if (-not (Test-Path -LiteralPath $nginxPath -PathType Leaf)) {
    throw "Nginx configuration not found: $nginxPath"
}

# Validate the local bundle without printing its contents.
$bundleText = [IO.File]::ReadAllText($bundlePath)
$certBlock = [regex]::Match(
    $bundleText,
    '-----BEGIN CERTIFICATE-----\s*(?<body>[A-Za-z0-9+/=\r\n]+?)\s*-----END CERTIFICATE-----'
)
$keyBlock = [regex]::Match(
    $bundleText,
    '-----BEGIN (?<type>[A-Z0-9 ]*PRIVATE KEY)-----[\s\S]+?-----END \k<type>-----'
)

if (-not $certBlock.Success -or -not $keyBlock.Success) {
    throw 'The bundle must contain one PEM certificate and one PEM private key.'
}

$certBytes = [Convert]::FromBase64String(($certBlock.Groups['body'].Value -replace '\s', ''))
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certBytes)
try {
    $san = $certificate.Extensions |
        Where-Object { $_.Oid.Value -eq '2.5.29.17' } |
        ForEach-Object { $_.Format($false) }

    if ($san -notmatch 'v2xb6205\.thunderuni\.com|\*\.thunderuni\.com' -or
        $san -notmatch 'smartwatch\.thunderuni\.com|\*\.thunderuni\.com') {
        throw 'The certificate does not cover both required hostnames.'
    }

    if ($certificate.NotAfter -le (Get-Date)) {
        throw 'The certificate has expired.'
    }
}
finally {
    $certificate.Dispose()
}

$destination = "$User@$Server"
$sshOptions = @(
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=12',
    '-o', 'StrictHostKeyChecking=accept-new'
)

Write-Host 'Uploading certificate bundle to the root-only staging location...'
& scp @sshOptions $bundlePath "${destination}:/root/.thunderuni-origin.pem.upload"
if ($LASTEXITCODE -ne 0) {
    throw 'Certificate upload failed.'
}

Write-Host 'Uploading the Nginx virtual-host configuration...'
& scp @sshOptions $nginxPath "${destination}:/root/.thunderuni.nginx.upload"
if ($LASTEXITCODE -ne 0) {
    throw 'Nginx configuration upload failed.'
}

$remoteScript = @'
set -euo pipefail
umask 077

bundle=/root/.thunderuni-origin.pem.upload
config=/root/.thunderuni.nginx.upload
ssl_dir=/etc/nginx/ssl/thunderuni
active_config=/etc/nginx/sites-enabled/thunderuni
timestamp=$(date +%Y%m%d-%H%M%S)

test -s "$bundle"
test -s "$config"
install -d -o root -g root -m 0700 "$ssl_dir"

awk '/-----BEGIN CERTIFICATE-----/{capture=1} capture{print} /-----END CERTIFICATE-----/{exit}' \
    "$bundle" > "$ssl_dir/origin.crt.new"
awk '/-----BEGIN .*PRIVATE KEY-----/{capture=1} capture{print} /-----END .*PRIVATE KEY-----/{exit}' \
    "$bundle" > "$ssl_dir/origin.key.new"

openssl x509 -in "$ssl_dir/origin.crt.new" -noout >/dev/null
openssl pkey -in "$ssl_dir/origin.key.new" -noout >/dev/null
openssl x509 -in "$ssl_dir/origin.crt.new" -checkend 86400 -noout >/dev/null

cert_hash=$(openssl x509 -in "$ssl_dir/origin.crt.new" -pubkey -noout | sha256sum | cut -d' ' -f1)
key_hash=$(openssl pkey -in "$ssl_dir/origin.key.new" -pubout | sha256sum | cut -d' ' -f1)
test "$cert_hash" = "$key_hash"

san=$(openssl x509 -in "$ssl_dir/origin.crt.new" -noout -ext subjectAltName)
printf '%s' "$san" | grep -Eq 'DNS:\*\.thunderuni\.com|DNS:v2xb6205\.thunderuni\.com'
printf '%s' "$san" | grep -Eq 'DNS:\*\.thunderuni\.com|DNS:smartwatch\.thunderuni\.com'

if [ -f "$active_config" ]; then
    cp -a "$active_config" "/etc/nginx/thunderuni.backup-$timestamp"
fi

install -o root -g root -m 0644 "$ssl_dir/origin.crt.new" "$ssl_dir/origin.crt"
install -o root -g root -m 0600 "$ssl_dir/origin.key.new" "$ssl_dir/origin.key"
install -o root -g root -m 0644 "$config" "$active_config"

nginx -t
systemctl reload nginx

rm -f "$ssl_dir/origin.crt.new" "$ssl_dir/origin.key.new" "$bundle" "$config"

printf 'origin_certificate: '
openssl x509 -in "$ssl_dir/origin.crt" -noout -subject -dates
printf 'private_key_permissions: '
stat -c '%a %U:%G' "$ssl_dir/origin.key"
printf 'nginx: '
systemctl is-active nginx
printf 'car_lab: '
systemctl is-active car-lab.service
printf 'smart_watch: '
docker ps --format '{{.Names}} {{.Status}}' | grep '^smart-watch-app '
printf 'v2_origin: '
curl -k -sS -o /dev/null -w '%{http_code}\n' \
    -H 'Host: v2xb6205.thunderuni.com' https://127.0.0.1/
printf 'smartwatch_origin: '
curl -k -sS -L --max-redirs 5 -o /dev/null -w '%{http_code}\n' \
    -H 'Host: smartwatch.thunderuni.com' https://127.0.0.1/
'@

Write-Host 'Installing the origin certificate and reloading Nginx...'
$remoteScript | & ssh @sshOptions $destination 'bash -s'
if ($LASTEXITCODE -ne 0) {
    throw 'Remote SSL repair failed. Review the Nginx backup before retrying.'
}

Write-Host 'Checking the two public HTTPS endpoints...'
foreach ($url in @(
    'https://v2xb6205.thunderuni.com/',
    'https://smartwatch.thunderuni.com/'
)) {
    $status = & curl.exe -sS -L --max-redirs 5 -o NUL -w '%{http_code}' $url
    if ($LASTEXITCODE -ne 0) {
        throw "Public verification failed for $url"
    }
    Write-Host "$url -> $status"
}

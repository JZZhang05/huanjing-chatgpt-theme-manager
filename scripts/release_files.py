"""Privacy boundaries for custom files versus unchanged, verified upstream packages."""
from pathlib import PurePosixPath

def check_private_paths(relative, data, home):
    path=PurePosixPath(relative.replace('\\','/'))
    if path.is_absolute() or '..' in path.parts:
        raise RuntimeError('Invalid artifact path: '+relative)
    # prepare_runtime verifies pinned archive hashes before extracting these paths.
    # Upstream build metadata can coincidentally contain the CI account's home.
    upstream=(path.parts[:2]==('tools','python') or
              path.parts[:1] in [('runtime',),('licenses',)])
    if upstream:
        return
    normalized=str(home).lower()
    variants=[normalized,normalized.replace('\\','\\\\'),normalized.replace('\\','/')]
    if any(value.encode('utf8') in data.lower() for value in variants):
        raise RuntimeError('Private build-machine path: '+relative)

"""Create a client-prototype account. Plain passwords never enter source or logs."""
import argparse
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--login', required=True)
    parser.add_argument('--first-name', required=True)
    parser.add_argument('--last-name', required=True)
    parser.add_argument('--generate', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'web/family-users.json'
    config = json.loads(target.read_text()) if target.exists() else {'version': 1, 'users': []}
    if any(u['login'] == args.login for u in config['users']):
        parser.error('Account already exists; remove it explicitly before replacing.')
    password = secrets.token_urlsafe(18) if args.generate else getpass.getpass('New password: ')
    if not password:
        parser.error('Password cannot be empty.')
    salt = secrets.token_bytes(16)
    user = dict(login=args.login, firstName=args.first_name, lastName=args.last_name,
                algorithm='PBKDF2-SHA256', iterations=600000,
                salt=base64.b64encode(salt).decode(),
                passwordHash=base64.b64encode(hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 600000)).decode())
    # Reserve the private handoff before changing the public account list.
    if args.generate:
        private = ROOT / 'sources/family-prototype-credentials.txt'
        private.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(private, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'a') as stream:
            stream.write(f'Login: {args.login}\nPassword: {password}\n\n')
    config['users'].append(user)
    target.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    print('Account created. Only a salted hash was saved in web/family-users.json.')
    if args.generate:
        print('Generated credentials saved locally in ignored sources/family-prototype-credentials.txt.')


if __name__ == '__main__':
    main()

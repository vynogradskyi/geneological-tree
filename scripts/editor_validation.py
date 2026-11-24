"""Validation shared by the local editor and its integration checks."""
from datetime import date
import json
import re


def validate_document(data, schema):
    def check(value, rule, path):
        if '$ref' in rule:
            target = schema
            for part in rule['$ref'].removeprefix('#/').split('/'):
                target = target[part]
            return check(value, target, path)
        if 'anyOf' in rule:
            for option in rule['anyOf']:
                try:
                    check(value, option, path)
                    return
                except ValueError:
                    pass
            raise ValueError(f'{path}: nieprawidłowa wartość.')
        kinds = rule.get('type', [])
        kinds = [kinds] if isinstance(kinds, str) else kinds
        matches = {'object': isinstance(value, dict), 'array': isinstance(value, list),
                   'string': isinstance(value, str), 'null': value is None,
                   'integer': type(value) is int, 'boolean': type(value) is bool}
        if kinds and not any(matches[k] for k in kinds):
            raise ValueError(f'{path}: nieprawidłowy typ danych.')
        if 'const' in rule and value != rule['const'] or 'enum' in rule and value not in rule['enum']:
            raise ValueError(f'{path}: niedozwolona wartość.')
        if isinstance(value, dict):
            if not set(rule.get('required', [])) <= value.keys():
                raise ValueError(f'{path}: brakuje wymaganych pól.')
            props = rule.get('properties', {})
            if rule.get('additionalProperties') is False and not value.keys() <= props.keys():
                raise ValueError(f'{path}: nierozpoznane pole.')
            for key in value.keys() & props.keys():
                check(value[key], props[key], f'{path}.{key}')
        if isinstance(value, list):
            if len(value) < rule.get('minItems', 0) or len(value) > rule.get('maxItems', len(value)):
                raise ValueError(f'{path}: nieprawidłowa liczba elementów.')
            if rule.get('uniqueItems') and len({json.dumps(v, sort_keys=True) for v in value}) != len(value):
                raise ValueError(f'{path}: powtórzony element.')
            for i, item in enumerate(value):
                if 'items' in rule:
                    check(item, rule['items'], f'{path}[{i}]')
        if isinstance(value, str):
            if len(value) < rule.get('minLength', 0) or 'pattern' in rule and not re.search(rule['pattern'], value):
                raise ValueError(f'{path}: nieprawidłowy format.')
        if type(value) is int and not rule.get('minimum', value) <= value <= rule.get('maximum', value):
            raise ValueError(f'{path}: liczba poza zakresem.')
    check(data, schema, 'dane')
    people = {p['id']: p for p in data['people']}
    if len(people) != len(data['people']):
        raise ValueError('Identyfikatory osób muszą być unikalne.')
    if data['rootPersonId'] not in people:
        raise ValueError('Nie znaleziono osoby głównej.')
    for p in people.values():
        pid = p['id']
        if p['Mommy'] is not None and p['Mommy'] == p['Daddy']:
            raise ValueError('Matka i ojciec muszą być różnymi osobami.')
        for field in ('Mommy', 'Daddy'):
            if p[field] is not None and (p[field] not in people or p[field] == pid):
                raise ValueError('Nieprawidłowe powiązanie z rodzicem.')
        for sibling in p['siblings']:
            if sibling not in people or sibling == pid or pid not in people[sibling]['siblings']:
                raise ValueError('Nieprawidłowe powiązanie rodzeństwa.')
        for prefix in ('birth', 'death'):
            value, year = p[prefix+'Date'], p[prefix+'Year']
            if (value is None) != (year is None) or value and int(value[:4]) != year:
                raise ValueError('Rok i data muszą być zgodne.')
            if value:
                try:
                    date.fromisoformat(value + ('-01-01' if len(value) == 4 else '-01' if len(value) == 7 else ''))
                except ValueError:
                    raise ValueError('Nieprawidłowa data w kalendarzu.')
        if p['isLiving'] is True and (p['deathDate'] or p.get('deathDateNote')):
            raise ValueError('Osoba żyjąca nie może mieć daty ani opisu śmierci.')
        if p['birthDate'] and p['deathDate'] and p['birthDate'] > p['deathDate']:
            raise ValueError('Data śmierci nie może poprzedzać daty urodzenia.')
    def visit(pid, path):
        if pid in path:
            raise ValueError('Ta zmiana tworzy cykl: osoba nie może być własnym przodkiem.')
        for field in ('Mommy', 'Daddy'):
            if people[pid][field]:
                visit(people[pid][field], path | {pid})
    for pid in people:
        visit(pid, set())
    relation_ids = {r['id'] for r in data['relationships']}
    if len(relation_ids) != len(data['relationships']):
        raise ValueError('Identyfikatory małżeństw muszą być unikalne.')
    for r in data['relationships']:
        if len(set(r['personIds'])) != 2 or any(pid not in people for pid in r['personIds']):
            raise ValueError('Nieprawidłowi uczestnicy małżeństwa.')
        if r['startYear'] and r['endYear'] and r['startYear'] > r['endYear']:
            raise ValueError('Koniec małżeństwa nie może poprzedzać początku.')
        if r['previousRelationshipId'] and (r['previousRelationshipId'] not in relation_ids or r['previousRelationshipId'] == r['id']):
            raise ValueError('Nieprawidłowe poprzednie małżeństwo.')
    if re.search('[\u0400-\u04ff]', json.dumps(data, ensure_ascii=False)):
        raise ValueError('Dane należy zapisać po polsku lub zatwierdzoną pisownią łacińską.')

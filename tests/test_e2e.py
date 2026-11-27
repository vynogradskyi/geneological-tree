"""Browser regression tests for the published viewer (synthetic data only).

Each test is tagged with a case ID from sdlc/test-cases.md (TC-...).

Run:
    python3 tests/test_e2e.py              # all cases
    python3 tests/test_e2e.py -k Search    # one group
Requires: pip install playwright pillow; a Chrome/Chromium
(system Google Chrome is used when present, otherwise `python3 -m playwright install chromium`).
E2E_HEADED=1 shows the browser window.
"""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e2e_site import build_site, serve

try:
    from playwright.sync_api import sync_playwright, expect
except ImportError:  # pragma: no cover - reported clearly to the developer
    sys.exit('Браузерные тесты требуют playwright: pip install playwright pillow')

DESKTOP = {'width': 1280, 'height': 800}
PHONE = {'width': 390, 'height': 844}
ROOT_ID = 'person_0001'
MOTHER, FATHER, SIBLING = 'person_0003', 'person_0002', 'person_0004'
GRANDMOTHER_DEAD, GRANDFATHER_NO_DATES = 'person_0005', 'person_0006'
GRANDFATHER_ABOUT, AUNT, COUSIN, UNKNOWN_NAME = 'person_0008', 'person_0009', 'person_0010', 'person_0012'

SITE = URL = PLAYWRIGHT = BROWSER = DATA = None
_contexts = []


def setUpModule():
    global SITE, URL, PLAYWRIGHT, BROWSER, DATA, _server
    SITE = tempfile.TemporaryDirectory(prefix='e2e-site-')
    DATA = build_site(SITE.name)
    _server = serve(SITE.name)
    URL = _server.__enter__()
    PLAYWRIGHT = sync_playwright().start()
    headless = not os.environ.get('E2E_HEADED')
    args = ['--disable-background-networking', '--no-first-run']
    channel = os.environ.get('E2E_BROWSER_CHANNEL', 'chrome')
    try:
        BROWSER = PLAYWRIGHT.chromium.launch(channel=channel or None, headless=headless, args=args)
    except Exception:
        BROWSER = PLAYWRIGHT.chromium.launch(headless=headless, args=args)
    # Smoke check: if the tree does not render at all, stop at once with the browser's error.
    smoke = Page()
    try:
        smoke.page.goto(URL)
        smoke.page.wait_for_selector('.person-node', timeout=15000)
    except Exception as error:
        details = '; '.join(smoke.errors) or smoke.page.text_content('#export-message') or str(error)
        tearDownModule()
        raise RuntimeError(f'Сайт не отрисовал дерево — остальные тесты не запускаются. {details}') from None
    finally:
        if BROWSER is not None and BROWSER.is_connected():
            smoke.close()


def tearDownModule():
    BROWSER.close()
    PLAYWRIGHT.stop()
    _server.__exit__(None, None, None)
    SITE.cleanup()


class Page:
    """Thin helper around a Playwright page that records JavaScript errors."""

    def __init__(self, viewport=DESKTOP, mobile=False, context=None):
        self.context = context or BROWSER.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile,
                                                      accept_downloads=True, locale='pl-PL')
        self.context.set_default_timeout(10000)  # fail fast instead of waiting 30 s per broken step
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('console', lambda msg: msg.type == 'error' and 'favicon' not in msg.text
                     and 'Failed to load resource' not in msg.text and self.errors.append(msg.text))
        # On 127.0.0.1 the viewer probes the local editor server (web/editor-storage.js); the static
        # test server answers 404 and the page falls back to read-only, as the published site does.
        self.page.on('response', lambda r: r.status >= 400 and not r.url.endswith('favicon.ico')
                     and not (r.status == 404 and r.url == URL + 'api/state')
                     and self.errors.append(f'HTTP {r.status} {r.url}'))

    def open(self, path=''):
        self.page.goto(URL + path)
        self.page.wait_for_selector('.person-node')
        self.page.wait_for_function('document.querySelectorAll(".person-node").length > 0 && document.getElementById("zoom-label")')
        self.page.wait_for_timeout(150)  # requestAnimationFrame(goRoot)
        return self

    def card(self, person_id):
        return self.page.locator(f'.person-node[data-person="{person_id}"]')

    def fit(self):
        if self.page.locator('#fit-tree').is_visible():
            self.page.click('#fit-tree')
        else:
            self.page.evaluate('document.getElementById("fit-tree").click()')
        self.page.wait_for_timeout(100)

    def tap_card(self, person_id):
        """Click the visible centre of a card, as a user would (after showing the whole tree)."""
        box = self.card(person_id).bounding_box()
        self.page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.4)
        self.page.wait_for_timeout(80)

    def dialog_open(self, dialog_id='person-dialog'):
        return self.page.evaluate(f'document.getElementById("{dialog_id}").open')

    def lineage(self):
        return sorted(self.page.eval_on_selector_all('.person-node.lineage-member', 'els => els.map(e => e.dataset.person)'))

    def selected(self):
        return self.page.eval_on_selector_all('.person-node.selected', 'els => els.map(e => e.dataset.person)')

    def open_details(self, person_id):
        self.fit()
        if person_id not in self.lineage():
            self.tap_card(person_id)
        self.tap_card(person_id)
        assert self.dialog_open(), 'Карточка человека не открылась'
        return self.page.locator('#person-details')

    def transform(self):
        return self.page.evaluate('document.getElementById("world").style.transform')

    def close(self):
        self.context.close()


class E2ETestCase(unittest.TestCase):
    viewport, mobile = DESKTOP, False

    def setUp(self):
        self.ui = Page(self.viewport, self.mobile).open()
        self.page = self.ui.page

    def tearDown(self):
        errors = self.ui.errors
        self.ui.close()
        self.assertEqual(errors, [], 'В консоли браузера есть ошибки JavaScript/HTTP')


class LoadAndTree(E2ETestCase):
    def test_TC_LOAD_01_page_loads_read_only(self):
        self.assertEqual(self.page.title(), 'Moje drzewo genealogiczne · Zofia Testowa')
        expect(self.page.locator('#summary')).to_have_text('12 osób · 3 pokolenia')
        expect(self.page.locator('#author-name')).to_have_text('Zofia Testowa')
        expect(self.page.locator('#save-mode')).to_have_text('Wersja tylko do odczytu')
        for removed in ('#family-login', '#edit-person', '#toggle-card-drag', '#download-changes'):
            expect(self.page.locator(removed)).to_have_count(0)  # read-only viewer: no login, editing or card moving
        expect(self.page.locator('#download-pdf')).to_be_visible()
        expect(self.page.locator('#go-root')).to_have_text('Zofia')
        self.assertFalse(self.page.evaluate('document.body.classList.contains("mobile-view")'), 'Десктоп не в мобильном режиме')

    def test_TC_TREE_01_every_person_has_one_card_without_overlap(self):
        ids = self.page.eval_on_selector_all('.person-node', 'els => els.map(e => e.dataset.person)')
        self.assertEqual(sorted(ids), sorted(p['id'] for p in DATA['people']))
        boxes = self.page.evaluate('''Object.fromEntries([...document.querySelectorAll('.person-node')].map(e =>
            [e.dataset.person, {x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight}]))''')
        items = list(boxes.items())
        for i, (a, ba) in enumerate(items):
            for b, bb in items[i + 1:]:
                overlap = ba['x'] < bb['x'] + bb['w'] and bb['x'] < ba['x'] + ba['w'] and \
                    ba['y'] < bb['y'] + bb['h'] and bb['y'] < ba['y'] + ba['h']
                self.assertFalse(overlap, f'Карточки {a} и {b} перекрываются')
        for person in DATA['people']:
            if person['Mommy'] and person['Daddy']:
                self.assertLess(boxes[person['Mommy']]['x'], boxes[person['Daddy']]['x'],
                                f'{person["id"]}: мать должна быть слева от отца')
            for parent in (person['Mommy'], person['Daddy']):
                if parent:
                    self.assertGreater(boxes[person['id']]['y'], boxes[parent]['y'], 'Ребёнок ниже родителя')

    def test_TC_TREE_02_dates_follow_rules(self):
        expected = {ROOT_ID: '14.05.2010 – ...', MOTHER: '01.03.1982 – ?', GRANDMOTHER_DEAD: '1950 – 02.11.2015',
                    GRANDFATHER_NO_DATES: '? – ?', GRANDFATHER_ABOUT: '1952 – 2001 (około)'}
        for person_id, text in expected.items():
            expect(self.ui.card(person_id).locator('.node-dates')).to_have_text(text)

    def test_TC_TREE_03_names_photos_and_branch_classes(self):
        expect(self.ui.card(UNKNOWN_NAME)).to_contain_text('Imię nieznane')
        expect(self.ui.card(ROOT_ID).locator('img.node-photo')).to_have_count(1)
        expect(self.ui.card(MOTHER).locator('.node-placeholder')).to_contain_text('AT')
        expect(self.ui.card(MOTHER).locator('.node-subtitle')).to_have_text('z domu Łódzka')
        expect(self.ui.card(FATHER).locator('.node-subtitle')).to_have_text('Inżynier testów')
        for person_id, branch in ((ROOT_ID, 'root'), (MOTHER, 'mother'), (FATHER, 'father'), (GRANDMOTHER_DEAD, 'mother')):
            expect(self.ui.card(person_id)).to_have_class(f'person-node branch-{branch}')

    def test_TC_TREE_04_generation_scale(self):
        labels = self.page.eval_on_selector_all('#generation-scale *', 'els => els.map(e => e.textContent.trim())')
        self.assertTrue(any(text == '3' for text in labels), labels)
        self.assertTrue(self.page.locator('#generation-scale').is_visible())

    def test_TC_TREE_05_connections_drawn(self):
        self.assertGreaterEqual(self.page.locator('#connections path.connection.parent').count(), 5)
        self.assertGreaterEqual(self.page.locator('#connections path.connection.marriage').count(), 1)


class Lineage(E2ETestCase):
    def test_TC_LIN_01_light_card_highlights_line_without_opening(self):
        self.ui.fit()
        self.ui.tap_card(MOTHER)
        self.assertFalse(self.ui.dialog_open())
        self.assertEqual(self.ui.selected(), [MOTHER])
        self.assertEqual(self.ui.lineage(), sorted([MOTHER, ROOT_ID, SIBLING, GRANDMOTHER_DEAD, GRANDFATHER_NO_DATES]))
        expect(self.ui.card(MOTHER)).to_have_attribute('aria-current', 'true')
        expect(self.page.locator('#clear-lineage')).to_be_visible()
        expect(self.page.locator('#announcer')).to_contain_text('Anna Testowa')
        self.assertGreater(self.page.locator('#connections .lineage-overlay path').count(), 0)
        expect(self.ui.card(AUNT)).to_have_attribute('aria-label', 'Krystyna Obca, 1978 – .... Podświetl linię rodzinną')

    def test_TC_LIN_02_dark_card_opens_details(self):
        self.ui.fit()
        self.ui.tap_card(MOTHER)
        expect(self.ui.card(GRANDMOTHER_DEAD)).to_have_attribute('aria-haspopup', 'dialog')
        self.ui.tap_card(GRANDMOTHER_DEAD)
        self.assertTrue(self.ui.dialog_open())
        expect(self.page.locator('#person-name')).to_have_text('Maria Łódzka')
        self.assertEqual(self.ui.selected(), [GRANDMOTHER_DEAD], 'Открытая карточка становится выбранной')

    def test_TC_LIN_03_clear_by_button_and_escape(self):
        self.ui.fit()
        self.ui.tap_card(FATHER)
        self.page.click('#clear-lineage')
        self.assertEqual(self.ui.lineage(), [])
        expect(self.page.locator('#lineage-controls')).to_be_hidden()
        self.ui.tap_card(FATHER)
        self.page.keyboard.press('Escape')
        self.assertEqual(self.ui.selected(), [])

    def test_TC_LIN_04_keyboard_activation(self):
        self.ui.card(COUSIN).focus()
        self.page.keyboard.press('Enter')
        self.assertEqual(self.ui.selected(), [COUSIN])
        self.assertFalse(self.ui.dialog_open())
        self.page.keyboard.press('Enter')
        self.assertTrue(self.ui.dialog_open())


class Details(E2ETestCase):
    def facts(self):
        return self.page.evaluate('''Object.fromEntries([...document.querySelectorAll('#person-details dt')]
            .map(dt => [dt.textContent, dt.nextElementSibling.textContent]))''')

    def test_TC_DET_01_mother_unknown_status_and_family(self):
        details = self.ui.open_details(MOTHER)
        self.assertEqual(self.facts(), {'Data urodzenia': '01.03.1982', 'Miejsce urodzenia': 'nieznane',
                                        'Status życia': 'nieustalony', 'Data śmierci': '?', 'Miejsce śmierci': 'nieznane'})
        expect(details.locator('.detail-subtitle')).to_have_text('z domu Łódzka')
        rows = self.page.evaluate('''Object.fromEntries([...document.querySelectorAll('.relative-row')].map(r =>
            [r.firstElementChild.textContent, [...r.querySelectorAll('[data-relative]')].map(b => b.dataset.relative)]))''')
        self.assertEqual(rows['Matka'], [GRANDMOTHER_DEAD])
        self.assertEqual(rows['Ojciec'], [GRANDFATHER_NO_DATES])
        self.assertEqual(sorted(rows['Małżeństwa']), sorted([FATHER, UNKNOWN_NAME]))
        self.assertEqual(sorted(rows['Dzieci']), sorted([ROOT_ID, SIBLING]))
        self.assertEqual(rows['Rodzeństwo'], [AUNT])
        expect(details).to_contain_text('Rozwód: Imię nieznane Dawny.')

    def test_TC_DET_02_living_and_deceased_facts(self):
        self.ui.open_details(ROOT_ID)
        facts = self.facts()
        self.assertEqual(facts['Status życia'], 'żyje')
        self.assertEqual(facts['Miejsce urodzenia'], 'Gdańsk, Polska')
        self.assertNotIn('Data śmierci', facts, 'У живых нет полей смерти')
        self.page.click('#close-person')
        self.ui.open_details(GRANDMOTHER_DEAD)
        facts = self.facts()
        self.assertEqual((facts['Status życia'], facts['Data śmierci'], facts['Miejsce śmierci']),
                         ('osoba zmarła', '02.11.2015', 'Kraków, Polska'))

    def test_TC_DET_03_relative_link_navigates(self):
        details = self.ui.open_details(MOTHER)
        details.locator(f'[data-relative="{AUNT}"]').click()
        expect(self.page.locator('#person-name')).to_have_text('Krystyna Obca')
        self.assertTrue(self.ui.dialog_open())

    def test_TC_DET_04_photo_credit_popover_and_links(self):
        details = self.ui.open_details(AUNT)
        self.assertEqual(details.locator('.source-info-button').count(), 0, 'ⓘ только у фото с атрибуцией')
        self.page.keyboard.press('Escape')
        details = self.ui.open_details(ROOT_ID)
        panel = details.locator('#person-sources')
        details.locator('.source-info-button').click()
        expect(panel).to_be_visible()
        link = panel.locator('a[href="https://example.org/zrodlo-testowe"]')
        expect(link).to_have_attribute('target', '_blank')
        expect(link).to_have_attribute('rel', 'noopener noreferrer')
        self.page.keyboard.press('Escape')
        expect(panel).to_be_hidden()
        self.assertTrue(self.ui.dialog_open(), 'Escape закрывает сначала только источники')

    def test_TC_DET_05_photo_enlarges(self):
        details = self.ui.open_details(ROOT_ID)
        details.locator('#enlarge-portrait').click()
        self.assertTrue(self.ui.dialog_open('photo-dialog'))
        self.assertTrue(self.page.evaluate('document.getElementById("full-photo").naturalWidth > 0'))
        self.page.click('#close-photo')
        self.assertFalse(self.ui.dialog_open('photo-dialog'))

    def test_TC_DET_06_text_is_escaped(self):
        details = self.ui.open_details(ROOT_ID)
        notes = details.locator('.notes')
        expect(notes).to_contain_text('<img src=x onerror="window.__xss=1">')
        self.assertEqual(notes.locator('img').count(), 0)
        self.assertIsNone(self.page.evaluate('window.__xss'))

    def test_TC_DET_07_open_question_and_unknown_dates(self):
        details = self.ui.open_details(GRANDFATHER_NO_DATES)
        expect(details).to_contain_text('Do wyjaśnienia')
        expect(details).to_contain_text('Syntetyczne pytanie testowe: data urodzenia?')
        expect(details.locator('.hero-life')).to_have_text('? – ?')

    def test_TC_DET_08_close_by_button_and_escape(self):
        self.ui.open_details(FATHER)
        self.page.click('#close-person')
        self.assertFalse(self.ui.dialog_open())
        self.ui.open_details(FATHER)
        self.page.keyboard.press('Escape')
        self.assertFalse(self.ui.dialog_open())
        self.assertTrue(self.page.evaluate('document.activeElement.dataset.person') == FATHER, 'Фокус возвращается на карточку')

    def test_TC_DET_09_guest_cannot_edit(self):
        self.ui.open_details(FATHER)
        expect(self.page.locator('#edit-person')).to_have_count(0)


class Search(E2ETestCase):
    def search(self, text):
        self.page.fill('#person-search', text)
        return self.page.locator('#search-results')

    def test_TC_SRCH_01_diacritics_and_maiden_names(self):
        results = self.search('lodzk')
        expect(results).to_be_visible()
        found = sorted(results.locator('[data-result]').evaluate_all('els => els.map(e => e.dataset.result)'))
        self.assertEqual(found, sorted([MOTHER, GRANDMOTHER_DEAD, GRANDFATHER_NO_DATES, AUNT]))
        expect(results.locator(f'[data-result="{MOTHER}"]')).to_contain_text('z domu Łódzka')
        self.assertEqual(self.page.get_attribute('#person-search', 'aria-expanded'), 'true')
        found = self.search('michal').locator('[data-result]').evaluate_all('els => els.map(e => e.dataset.result)')
        self.assertEqual(found, ['person_0011'], 'Строчная ł ищется как l')

    def test_TC_SRCH_02_choose_result_highlights_and_focuses(self):
        self.search('Tomasz').locator(f'[data-result="{COUSIN}"]').click()
        self.assertEqual(self.ui.selected(), [COUSIN])
        self.assertFalse(self.ui.dialog_open())
        self.assertEqual(self.page.input_value('#person-search'), '')
        expect(self.page.locator('#search-results')).to_be_hidden()
        self.assertEqual(self.page.evaluate('document.activeElement.dataset.person'), COUSIN)
        box = self.ui.card(COUSIN).bounding_box()
        self.assertTrue(0 <= box['x'] + box['width'] / 2 <= DESKTOP['width'], 'Карточка выведена на экран')

    def test_TC_SRCH_03_no_results_escape_and_enter(self):
        expect(self.search('Nieistniejący')).to_contain_text('Nie znaleziono osoby.')
        self.page.keyboard.press('Escape')
        expect(self.page.locator('#search-results')).to_be_hidden()
        self.search('Piotr')
        self.page.keyboard.press('Enter')
        self.assertEqual(self.ui.selected(), [SIBLING])

    def test_TC_SRCH_04_search_by_birth_year(self):
        found = self.search('1976').locator('[data-result]').evaluate_all('els => els.map(e => e.dataset.result)')
        self.assertEqual(found, ['person_0011'])


class Languages(E2ETestCase):
    def switch(self, language):
        self.page.select_option('#language-select', language)
        self.page.wait_for_timeout(100)

    def test_TC_I18N_01_switch_and_persist(self):
        self.switch('ru')
        expect(self.page.locator('#fit-tree')).to_have_text('Всё дерево')
        expect(self.page.locator('#download-pdf')).to_contain_text('Скачать PDF')
        expect(self.ui.card(ROOT_ID).locator('.node-name').first).to_have_text('Софья')
        self.page.reload()
        self.page.wait_for_selector('.person-node')
        self.assertEqual(self.page.input_value('#language-select'), 'ru')
        expect(self.ui.card(ROOT_ID).locator('.node-name').first).to_have_text('Софья')
        self.switch('en')
        expect(self.page.locator('#fit-tree')).to_have_text('Entire tree')
        expect(self.ui.card(ROOT_ID).locator('.node-name').first).to_have_text('Sophie')
        self.switch('pl')
        expect(self.page.locator('#fit-tree')).to_have_text('Całe drzewo')
        expect(self.ui.card(ROOT_ID).locator('.node-name').first).to_have_text('Zofia')

    def test_TC_I18N_02_details_follow_language(self):
        self.switch('ru')
        details = self.ui.open_details(GRANDFATHER_NO_DATES)
        expect(details).to_contain_text('Синтетический тестовый вопрос: дата рождения?')
        self.assertEqual(self.page.input_value('#person-language-select'), 'ru')
        self.page.select_option('#person-language-select', 'pl')
        expect(details).to_contain_text('Syntetyczne pytanie testowe')
        self.assertEqual(self.page.input_value('#language-select'), 'pl')
        self.assertTrue(self.ui.dialog_open(), 'Смена языка не закрывает карточку')

    def test_TC_I18N_03_untranslated_names_keep_polish_and_facts(self):
        self.switch('en')
        expect(self.ui.card(MOTHER).locator('.node-name').first).to_have_text('Anna')
        expect(self.ui.card(MOTHER).locator('.node-dates')).to_have_text('01.03.1982 – ?')
        self.assertEqual(sorted(self.page.eval_on_selector_all('.person-node', 'els => els.map(e => e.dataset.person)')),
                         sorted(p['id'] for p in DATA['people']))


class Navigation(E2ETestCase):
    def test_TC_VIEW_01_zoom_buttons(self):
        expect(self.page.locator('#zoom-label')).to_have_text('100%')
        self.page.click('#zoom-in')
        expect(self.page.locator('#zoom-label')).to_have_text('125%')
        self.page.click('#zoom-out')
        self.page.click('#zoom-out')
        expect(self.page.locator('#zoom-label')).to_have_text('80%')
        for _ in range(12):
            self.page.click('#zoom-in')
        expect(self.page.locator('#zoom-label')).to_have_text('250%')

    def test_TC_VIEW_02_fit_tree_shows_every_card(self):
        self.ui.fit()
        viewport = self.page.locator('#viewport').bounding_box()
        for card in self.page.locator('.person-node').all():
            box = card.bounding_box()
            self.assertGreaterEqual(box['x'], viewport['x'] - 1)
            self.assertLessEqual(box['x'] + box['width'], viewport['x'] + viewport['width'] + 1)
            self.assertGreaterEqual(box['y'], viewport['y'] - 1)
            self.assertLessEqual(box['y'] + box['height'], viewport['y'] + viewport['height'] + 1)

    def test_TC_VIEW_03_root_button_returns_to_root(self):
        self.ui.fit()
        self.page.click('#go-root')
        expect(self.page.locator('#zoom-label')).to_have_text('100%')
        box, viewport = self.ui.card(ROOT_ID).bounding_box(), self.page.locator('#viewport').bounding_box()
        self.assertTrue(viewport['x'] <= box['x'] + box['width'] / 2 <= viewport['x'] + viewport['width'])
        self.assertTrue(viewport['y'] <= box['y'] + box['height'] / 2 <= viewport['y'] + viewport['height'])

    def test_TC_VIEW_04_drag_background_pans_without_selecting(self):
        self.ui.fit()
        before = self.ui.transform()
        viewport = self.page.locator('#viewport').bounding_box()
        x, y = viewport['x'] + viewport['width'] - 40, viewport['y'] + viewport['height'] - 30
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        self.page.mouse.move(x - 120, y - 60, steps=8)
        self.page.mouse.up()
        self.assertNotEqual(self.ui.transform(), before)
        self.assertEqual(self.ui.selected(), [])
        self.assertFalse(self.ui.dialog_open())

    def test_TC_VIEW_05_wheel_pans_and_ctrl_wheel_zooms(self):
        before = self.ui.transform()
        self.page.mouse.move(640, 500)
        self.page.mouse.wheel(0, 200)
        self.page.wait_for_timeout(50)
        self.assertNotEqual(self.ui.transform(), before)
        self.page.keyboard.down('Control')
        self.page.mouse.wheel(0, -100)
        self.page.keyboard.up('Control')
        self.assertNotEqual(self.page.text_content('#zoom-label'), '100%')


class CardLayout(E2ETestCase):
    def test_TC_LAY_01_dragging_a_card_pans_without_moving_it(self):
        start = self.page.evaluate(f'document.querySelector("[data-person={ROOT_ID}]").offsetLeft')
        self.ui.fit()
        before = self.ui.transform()
        box = self.ui.card(ROOT_ID).bounding_box()
        self.page.mouse.move(box['x'] + 40, box['y'] + 40)
        self.page.mouse.down()
        self.page.mouse.move(box['x'] - 60, box['y'] + 40, steps=8)
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate(f'document.querySelector("[data-person={ROOT_ID}]").offsetLeft'), start,
                         'Карточки не перемещаются, перетаскивание двигает дерево')
        self.assertNotEqual(self.ui.transform(), before)
        self.assertFalse(self.ui.dialog_open(), 'Перетаскивание не открывает карточку')


class Pdf(E2ETestCase):
    def test_TC_PDF_01_download_pdf(self):
        with self.page.expect_download(timeout=60000) as info:
            self.page.click('#download-pdf')
        download = info.value
        self.assertEqual(download.suggested_filename, 'moje-drzewo-genealogiczne.pdf')
        with open(download.path(), 'rb') as handle:
            content = handle.read()
        self.assertTrue(content.startswith(b'%PDF'))
        self.assertGreater(len(content), 10000)
        expect(self.page.locator('#download-pdf')).to_be_enabled()


class Phone(E2ETestCase):
    viewport, mobile = PHONE, True

    def no_horizontal_overflow(self):
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), self.viewport['width'])

    def test_TC_MOB_01_layout_and_menu(self):
        self.no_horizontal_overflow()
        self.assertTrue(self.page.evaluate('document.body.classList.contains("mobile-view")'))
        expect(self.page.locator('#mobile-quick-actions #go-root')).to_be_visible()
        expect(self.ui.card(ROOT_ID)).to_be_in_viewport()
        self.page.click('#open-mobile-menu')
        self.assertTrue(self.ui.dialog_open('mobile-menu'))
        menu = self.page.locator('#mobile-menu')
        for selector in ('#language-select', '#download-pdf', '#open-mobile-search'):
            expect(menu.locator(selector)).to_be_visible()
        self.page.click('#close-mobile-menu')
        self.assertFalse(self.ui.dialog_open('mobile-menu'))

    def test_TC_MOB_02_search_from_menu(self):
        self.page.click('#open-mobile-menu')
        self.page.click('#open-mobile-search')
        self.assertTrue(self.ui.dialog_open('search-dialog'))
        self.page.fill('#person-search', 'Krystyna')
        self.page.locator(f'[data-result="{AUNT}"]').click()
        self.assertFalse(self.ui.dialog_open('search-dialog'))
        self.assertEqual(self.ui.selected(), [AUNT])

    def test_TC_MOB_03_tap_highlight_then_sheet(self):
        self.ui.fit()
        box = self.ui.card(FATHER).bounding_box()
        self.page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.assertEqual(self.ui.selected(), [FATHER])
        self.assertFalse(self.ui.dialog_open())
        box = self.ui.card(FATHER).bounding_box()
        self.page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.assertTrue(self.ui.dialog_open())
        expect(self.page.locator('#toggle-person-size')).to_be_visible()
        self.page.click('#toggle-person-size')
        expect(self.page.locator('#toggle-person-size')).to_have_attribute('aria-expanded', 'true')
        self.page.click('#show-in-tree')
        self.assertFalse(self.ui.dialog_open())
        self.no_horizontal_overflow()


class SmallPhone(E2ETestCase):
    viewport, mobile = {'width': 320, 'height': 640}, True

    def test_TC_MOB_04_narrow_phone(self):
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 320)
        expect(self.ui.card(ROOT_ID)).to_be_in_viewport()
        expect(self.page.locator('#open-mobile-menu')).to_be_in_viewport()


class LowLandscape(E2ETestCase):
    viewport, mobile = {'width': 844, 'height': 390}, True

    def test_TC_MOB_05_low_landscape(self):
        self.assertTrue(self.page.evaluate('document.body.classList.contains("mobile-view")'))
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 844)
        expect(self.ui.card(ROOT_ID)).to_be_in_viewport()
        expect(self.page.locator('#zoom-label')).to_have_text('75%')


class NarrowDesktopWindow(E2ETestCase):
    viewport = {'width': 700, 'height': 900}

    def test_TC_MOB_06_narrow_mouse_window_uses_mobile_layout(self):
        self.assertTrue(self.page.evaluate('document.body.classList.contains("mobile-view")'))
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 700)
        expect(self.page.locator('#mobile-quick-actions #go-root')).to_be_visible()


if __name__ == '__main__':
    unittest.main(verbosity=2)

"""Verify SPA documents and their script/style assets after publication."""
import argparse
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'script' and attrs.get('src'):
            self.items.append((attrs['src'], 'javascript'))
        if tag == 'link' and attrs.get('rel') == 'stylesheet' and attrs.get('href'):
            self.items.append((attrs['href'], 'css'))


def verify(base):
    assets = set()
    for route in ('/', '/portal', '/assignments', '/resources'):
        url = urljoin(base.rstrip('/') + '/', route.lstrip('/'))
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
            assert response.status == 200, url
            assert response.headers.get_content_type() == 'text/html', url
            parser = Assets()
            parser.feed(response.read().decode('utf-8-sig'))
            assert any(kind == 'javascript' for _, kind in parser.items), f'No entry script: {url}'
            assets.update((urljoin(url, asset), kind) for asset, kind in parser.items)
    for url, kind in sorted(assets):
        assert urlsplit(url).netloc == urlsplit(base).netloc, f'Unexpected asset host: {url}'
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
            mime = response.headers.get_content_type()
            data = response.read()
            valid = mime in ('application/javascript', 'text/javascript') if kind == 'javascript' else mime == 'text/css'
            assert response.status == 200 and valid and data, f'Invalid asset: {url} ({response.status}, {mime})'
            assert not data.lstrip(b'\xef\xbb\xbf \r\n').lower().startswith((b'<!doctype html', b'<html')), f'HTML fallback at {url}'
            print(f'OK {mime} {len(data)} bytes {url}')
    print('PASS: homepage, portal, assignments, resources and entry assets')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base_url')
    args = parser.parse_args()
    verify(args.base_url)

from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from release_files import check_private_paths

class ReleasePrivacyTests(unittest.TestCase):
    def test_first_party_paths_reject_builder_home(self):
        home='Q:\\builder-home'
        for file in ['runtime.mjs','source/src/runtime.mjs','source/README.md']:
            for value in [home,home.replace('\\','\\\\'),home.replace('\\','/'),home.upper()]:
                with self.subTest(file=file,value=value):
                    with self.assertRaisesRegex(RuntimeError,'Private build-machine path'):
                        check_private_paths(file,('prefix '+value+' suffix').encode(),home)

    def test_pinned_upstream_metadata_keeps_original_bytes(self):
        home='Q:\\builder-home'
        data=('upstream compiler path '+home).encode()
        for file in ['tools/python/Lib/site-packages/numpy/__config__.py',
                     'runtime/LICENSE.txt','licenses/Python-LICENSE.txt']:
            check_private_paths(file,data,home)
        self.assertEqual(data,('upstream compiler path '+home).encode())

    def test_similar_names_and_nested_copies_remain_first_party(self):
        home='Q:\\builder-home'
        for file in ['tools/python-unverified/config.py','runtime-extra/notes.txt',
                     'source/tools/python/config.py','../tools/python/config.py',
                     'tools/python/../../private.txt']:
            with self.subTest(file=file):
                with self.assertRaises(RuntimeError):
                    check_private_paths(file,home.encode(),home)

if __name__=='__main__':
    unittest.main()

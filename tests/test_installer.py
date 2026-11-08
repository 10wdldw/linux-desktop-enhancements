import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'scripts'))
from beautify import Installer, fingerprint, EXTENSION
from build import build_bundle


def options(**kwargs):
    values = dict(apply=False, backup_existing=False, dry_run=False, theme='dark', set_session_language=False, preserve_input=False, defer_activation=False)
    values.update(kwargs)
    return argparse.Namespace(**values)


class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload_temp = tempfile.TemporaryDirectory(prefix='beautify-test-payload-')
        cls.packages = {edition: build_bundle(edition, Path(cls.payload_temp.name)/edition) for edition in ['zh', 'en']}

    @classmethod
    def tearDownClass(cls):
        cls.payload_temp.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='beautify-test-home-')
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        env = {'HOME':str(self.home), 'XDG_DATA_HOME':str(self.home/'data'),
               'XDG_CONFIG_HOME':str(self.home/'config'), 'XDG_STATE_HOME':str(self.home/'state')}
        self.environment = patch.dict(os.environ, env)
        self.environment.start(); self.addCleanup(self.environment.stop)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__(); self.addCleanup(self.output.__exit__, None, None, None)
        self.version = patch.object(Installer, 'shell_version', return_value='GNOME Shell 50.1')
        self.version.start(); self.addCleanup(self.version.stop)
        self.calls = []
        self.language_reader=patch.object(Installer,'account_language',return_value='zh_CN').start()
        self.language_writer=patch.object(Installer,'set_account_language').start()
        self.addCleanup(patch.stopall)
        def fake_command(argv, check=True):
            self.calls.append(argv)
            output='en_US.utf8\nzh_CN.utf8\n' if argv==['locale','-a'] else ('true\n' if 'writable' in argv else '')
            return subprocess.CompletedProcess(argv, 0, output, '')
        self.commands = patch('beautify.command', side_effect=fake_command)
        self.fake_command = fake_command
        self.commands.start(); self.addCleanup(self.commands.stop)

    def installer(self, edition='en'):
        package = self.packages[edition]
        return Installer(package, json.loads((package/'profile.json').read_text()))

    def test_english_payload_and_install_do_not_touch_input_or_locale(self):
        install = self.installer()
        self.assertEqual(install.profile['language'], 'en')
        self.assertFalse((install.package/'payload/rime').exists())
        self.assertFalse((install.package/'payload/kimpanel@kde.org').exists())
        install.install(options())
        self.assertFalse((install.data/'fcitx5').exists())
        self.assertFalse(install.config.exists())
        self.assertFalse(any(c[0] in ['gsettings','gdbus','busctl'] for c in self.calls))

    def test_each_edition_contains_one_extension_and_no_external_controller(self):
        for edition, package in self.packages.items():
            self.assertEqual([p.name for p in (package/'payload').iterdir()], [EXTENSION])
            extension = package/'payload'/EXTENSION
            self.assertEqual(list(extension.rglob('metadata.json')), [extension/'metadata.json'])
            self.assertFalse((extension/'dock/extension.js').exists())
            self.assertNotIn('enableExtension', (extension/'extension.js').read_text())
            self.assertEqual((extension/'input').is_dir(), edition == 'zh')
            self.assertEqual((extension/'resources/runtime/usr/bin/fcitx5').is_file(), edition == 'zh')
            if edition == 'zh':
                self.assertTrue((extension/'resources/runtime/sources/fcitx5_5.1.19.orig.tar.xz').is_file())

    def test_immutable_theme_and_dictionary_resources_are_linked_once(self):
        install = self.installer('zh')
        install.install(options())
        theme = install.data/'themes/MacStyle-Light'
        dictionary = install.data/'fcitx5/rime/cn_dicts/base.dict.yaml'
        for resource in [theme, dictionary]:
            self.assertTrue(resource.is_symlink())
            self.assertTrue(resource.resolve().is_relative_to(install.data/'gnome-shell/extensions'/EXTENSION))
        install.restore(*install.current())
        self.assertFalse(theme.exists())
        self.assertFalse(dictionary.exists())

    def test_activation_only_enables_main_and_restores_all_overlaps(self):
        from beautify import LEGACY
        install=self.installer('zh');calls=[]
        def fake(argv,check=True):
            calls.append(argv);output=''
            if argv==['locale','-a']: output='en_US.utf8\n'
            elif argv[:2]==['gsettings','get']: output="'old'\n"
            elif argv[:2]==['gsettings','writable']: output='true\n'
            elif argv[:2]==['gnome-extensions','list']:
                output='\n'.join(LEGACY if '--enabled' in argv else [EXTENSION]+LEGACY)+'\n'
            elif argv[:2]==['gnome-extensions','info'] and (install.data/'gnome-shell/extensions'/EXTENSION).exists(): output='State: ACTIVE\n'
            return subprocess.CompletedProcess(argv,0,output,'')
        with patch.object(install,'doctor'),patch('beautify.command',side_effect=fake):
            install.install(options(apply=True))
            self.assertEqual([c[2] for c in calls if c[:2]==['gnome-extensions','enable']], [EXTENSION])
            manifest,directory=install.current()
            self.assertEqual(manifest['extensions_disabled'], LEGACY)
            install.restore(manifest,directory)
        self.assertFalse(any('enabled-extensions' in c for c in calls))
        for uuid in LEGACY: self.assertIn(['gnome-extensions','enable',uuid],calls)

    def test_english_activation_preserves_existing_input_panel(self):
        install=self.installer('en'); calls=[]
        def fake(argv, check=True):
            calls.append(argv); output=''
            if argv == ['locale','-a']: output='en_US.utf8\n'
            elif argv[:2] == ['gsettings','get']: output="'old'\n"
            elif argv[:2] == ['gsettings','writable']: output='true\n'
            elif argv[:2] == ['gnome-extensions','list']:
                output=('' if '--enabled' in argv else EXTENSION+'\n')+'kimpanel@kde.org\n'
            elif argv[:2] == ['gnome-extensions','info'] and (install.data/'gnome-shell/extensions'/EXTENSION).exists(): output='State: ACTIVE\n'
            return subprocess.CompletedProcess(argv,0,output,'')
        with patch.object(install,'doctor'), patch('beautify.command',side_effect=fake):
            install.install(options(apply=True))
        self.assertNotIn(['gnome-extensions','disable','kimpanel@kde.org'], calls)
        self.assertIn(['gnome-extensions','enable',EXTENSION], calls)
        self.assertNotIn('kimpanel@kde.org', install.current()[0]['extensions_disabled'])

    def test_dry_run_has_no_user_file_writes(self):
        install = self.installer('zh')
        install.install(options(dry_run=True))
        self.assertEqual(list(self.home.iterdir()), [])

    def test_conflict_is_detected_before_any_copy(self):
        install = self.installer()
        original = install.data/'themes/MacStyle-Light'
        original.mkdir(parents=True)
        (original/'mine').write_text('original')
        before = fingerprint(self.home)
        with self.assertRaisesRegex(RuntimeError, 'Existing targets'):
            install.install(options())
        self.assertEqual(fingerprint(self.home), before)

    def test_install_backup_uninstall_preserves_symlink(self):
        install = self.installer()
        original = install.data/'themes/MacStyle-Light'
        original.parent.mkdir(parents=True)
        original.symlink_to(self.home/'missing-original-theme', target_is_directory=True)
        install.install(options(backup_existing=True))
        self.assertTrue(original.is_symlink())
        manifest, directory = install.current()
        install.restore(manifest, directory)
        self.assertTrue(original.is_symlink())
        self.assertEqual(os.readlink(original), str(self.home/'missing-original-theme'))

    def test_modified_install_blocks_then_preserves_changes_on_force(self):
        install = self.installer()
        install.install(options())
        target = install.data/'themes/MacStyle-Light/index.theme'
        target.write_text('my edited theme')
        manifest, directory = install.current()
        with self.assertRaisesRegex(RuntimeError, 'Installed files changed'):
            install.restore(manifest, directory)
        self.assertEqual(target.read_text(), 'my edited theme')
        install.restore(manifest, directory, force=True)
        saved = list((directory/'removed-content').rglob('index.theme'))
        changed = [p for p in saved if p.read_text() == 'my edited theme']
        self.assertEqual(len(changed),1)

    def test_failed_copy_rolls_back_originals(self):
        install = self.installer()
        original = install.data/'themes/MacStyle-Light'
        original.mkdir(parents=True)
        (original/'mine').write_text('keep me')
        actual_link = Path.symlink_to
        def fail_theme(target, source, *args, **kwargs):
            if Path(target) == original:
                raise OSError('simulated full disk')
            return actual_link(target, source, *args, **kwargs)
        with patch.object(Path, 'symlink_to', fail_theme):
            with self.assertRaisesRegex(OSError, 'simulated full disk'):
                install.install(options(backup_existing=True))
        self.assertEqual((original/'mine').read_text(), 'keep me')
        self.assertFalse((install.data/'gnome-shell/extensions'/EXTENSION).exists())
        self.assertFalse((install.state/'current.json').exists())

    def test_chinese_never_replaces_learned_or_personal_phrase_files(self):
        install = self.installer('zh')
        rime = install.data/'fcitx5/rime'
        (rime/'rime_ice.userdb').mkdir(parents=True)
        (rime/'rime_ice.userdb/private').write_text('private words')
        (rime/'custom_phrase.txt').write_text('personal phrase')
        install.install(options(backup_existing=True))
        self.assertEqual((rime/'custom_phrase.txt').read_text(),'personal phrase')
        self.assertEqual((rime/'rime_ice.userdb/private').read_text(),'private words')
        self.assertTrue((rime/'rime_ice.schema.yaml').is_file())
        self.assertFalse((rime/'installation.yaml').exists())
        manifest, directory = install.current()
        install.restore(manifest, directory)
        self.assertEqual((rime/'custom_phrase.txt').read_text(),'personal phrase')
        self.assertEqual((rime/'rime_ice.userdb/private').read_text(),'private words')

    def test_edition_replacement_uninstalls_one_layer_at_a_time(self):
        english = self.installer('en')
        english.install(options())
        first, first_dir = english.current()
        chinese = self.installer('zh')
        chinese.install(options(backup_existing=True))
        second, second_dir = chinese.current()
        self.assertEqual(second['previous_installation'],first['id'])
        chinese.restore(second,second_dir)
        self.assertEqual(english.current()[0]['id'],first['id'])
        metadata=json.loads((english.data/'gnome-shell/extensions'/EXTENSION/'metadata.json').read_text())
        self.assertEqual(metadata['beautify-edition'],'en')
        english.restore(*english.current())
        self.assertFalse((english.state/'current.json').exists())

    def test_chinese_to_english_withdraws_ime_and_reverses_one_layer(self):
        chinese=self.installer('zh')
        original=chinese.config/'fcitx5/profile'
        original.parent.mkdir(parents=True);original.write_text('user original profile')
        with patch.object(chinese,'doctor'):
            chinese.install(options(apply=True,backup_existing=True))
        managed_profile=original.read_text()
        launcher=chinese.home/'.local/bin/linux-beautify-ime'
        self.assertTrue(launcher.is_symlink())
        english=self.installer('en')
        english.install(options(backup_existing=True))
        self.assertFalse(launcher.exists())
        self.assertEqual(original.read_text(),'user original profile')
        self.assertFalse((english.config/'autostart/fcitx5.desktop').exists())
        english.restore(*english.current())
        self.assertTrue(launcher.is_file())
        self.assertEqual(original.read_text(),managed_profile)
        chinese.restore(*chinese.current())
        self.assertEqual(original.read_text(),'user original profile')

    def test_restore_retry_does_not_delete_already_restored_files(self):
        install=self.installer()
        target=install.data/'themes/MacStyle-Light'
        target.mkdir(parents=True);(target/'original').write_text('original')
        install.install(options(backup_existing=True))
        manifest,directory=install.current()
        manifest['settings']=[{'schema':'test','key':'test','old':'false','new':'true'}]
        with patch('beautify.command',side_effect=lambda argv,check=True: (_ for _ in ()).throw(RuntimeError('offline settings')) if argv[0]=='gsettings' else subprocess.CompletedProcess(argv,0,'','')):
            with self.assertRaisesRegex(RuntimeError,'some session settings'):
                install.restore(manifest,directory)
        self.assertEqual((target/'original').read_text(),'original')
        manifest,directory=install.current()
        install.restore(manifest,directory)
        self.assertEqual((target/'original').read_text(),'original')

    def test_apply_settings_rollback_on_mid_application_failure(self):
        install=self.installer()
        values={}; failures=[True]
        def settings_command(argv,check=True):
            if argv==['locale','-a']:
                return subprocess.CompletedProcess(argv,0,'en_US.utf8\nzh_CN.utf8\n','')
            if argv[:2]==['gsettings','get']:
                return subprocess.CompletedProcess(argv,0,"'original'\n",'')
            if argv[:2]==['gsettings','writable']:
                return subprocess.CompletedProcess(argv,0,'true\n','')
            if argv[:2]==['gsettings','set']:
                if argv[3]=='color-scheme' and argv[4]!="'original'" and failures[0]:
                    failures[0]=False
                    raise RuntimeError('simulated settings failure')
                values[(argv[2],argv[3])]=argv[4]
            return subprocess.CompletedProcess(argv,0,'','')
        with patch.object(install,'doctor'),patch('beautify.command',side_effect=settings_command):
            with self.assertRaisesRegex(RuntimeError,'simulated settings failure'):
                install.install(options(apply=True))
        self.assertEqual(set(values.values()),{"'original'"})
        self.assertFalse((install.data/'gnome-shell/extensions'/EXTENSION).exists())

    def test_all_distributed_paths_exclude_machine_state(self):
        for edition,package in self.packages.items():
            for p in package.rglob('*'):
                self.assertNotIn('rime_ice.userdb',p.parts)
                self.assertNotIn('sync',p.parts)
                self.assertNotIn(p.name,['user.yaml','installation.yaml','cached_layouts'])
                if p.is_file() and p.suffix in ['.py','.js','.json','.yaml','.conf','.desktop']:
                    self.assertNotIn('/home/as',p.read_text(errors='replace'),str(p))

    def test_english_apply_defaults_to_english_session_and_restores_old_language(self):
        install=self.installer('en')
        def isolated_commands(argv,check=True):
            if argv[:2]==['locale','-a']:
                output='en_US.utf8\nzh_CN.utf8\n'
            elif argv[:2]==['gsettings','get']:
                output="'old value'\n"
            elif argv[:2]==['gsettings','writable']:
                output='true\n'
            else:
                output=''
            return subprocess.CompletedProcess(argv,0,output,'')
        with patch('beautify.command',side_effect=isolated_commands),patch.object(install,'doctor'), \
                patch.object(install,'account_language',return_value='zh_CN') as old, \
                patch.object(install,'set_account_language') as language:
            install.install(options(apply=True))
            old.assert_called_once()
            self.assertEqual(language.call_args_list[0].args,('en_US.UTF-8',))
            install.restore(*install.current())
            self.assertEqual(language.call_args_list[-1].args,('zh_CN',))

    def test_session_language_cannot_change_on_resource_only_install(self):
        install=self.installer('en')
        with self.assertRaisesRegex(RuntimeError,'requires --apply'):
            install.install(options(set_session_language=True))
        self.assertFalse(install.state.exists())

    def test_activation_error_rolls_back_and_restores_legacy_extension(self):
        install=self.installer('en')
        calls=[]
        def commands(argv,check=True):
            calls.append(argv)
            output=''
            if argv==['locale','-a']:
                output='en_US.utf8\nzh_CN.utf8\n'
            elif argv[:2]==['gsettings','get']:
                output="'original'\n"
            elif argv[:2]==['gsettings','writable']:
                output='true\n'
            elif argv[:2]==['gnome-extensions','list']:
                output='macstyle-session@local\nubuntu-dock@ubuntu.com\n' if '--enabled' in argv else EXTENSION+'\nmacstyle-session@local\nubuntu-dock@ubuntu.com\n'
            elif argv[:2]==['gnome-extensions','info'] and (install.data/'gnome-shell/extensions'/EXTENSION).exists():
                output=argv[2]+'\n  State: '+('ERROR' if argv[2]==EXTENSION else 'ACTIVE')+'\n'
            return subprocess.CompletedProcess(argv,0,output,'')
        with patch.object(install,'doctor'),patch('beautify.command',side_effect=commands):
            with self.assertRaisesRegex(RuntimeError,'activation failed'):
                install.install(options(apply=True))
        self.assertIn(['gnome-extensions','enable','macstyle-session@local'],calls)
        self.assertFalse((install.data/'gnome-shell/extensions'/EXTENSION).exists())
        self.assertFalse((install.state/'current.json').exists())
        self.assertFalse(any('enabled-extensions' in c for c in calls))

    def test_replacement_restores_previously_enabled_main_plugin(self):
        install=self.installer('en')
        target=install.data/'gnome-shell/extensions'/EXTENSION
        target.mkdir(parents=True)
        (target/'old-source').write_text('old edition')
        calls=[]
        def commands(argv,check=True):
            calls.append(argv)
            output=EXTENSION+'\n' if argv[:2]==['gnome-extensions','list'] else ''
            return subprocess.CompletedProcess(argv,0,output,'')
        with patch('beautify.command',side_effect=commands):
            install.install(options(backup_existing=True))
            install.restore(*install.current())
        self.assertEqual((target/'old-source').read_text(),'old edition')
        self.assertIn(['gnome-extensions','enable',EXTENSION],calls)

    def test_chinese_apply_does_not_implicitly_change_session_language(self):
        install=self.installer('zh')
        with patch.object(install,'doctor'):
            install.install(options(apply=True))
        self.language_reader.assert_not_called()
        self.language_writer.assert_not_called()
        install.restore(*install.current())

    def test_english_apply_dry_run_shows_language_without_contacting_accounts(self):
        install=self.installer('en')
        output=io.StringIO()
        with contextlib.redirect_stdout(output):
            install.install(options(apply=True,dry_run=True))
        self.assertIn('SESSION LANGUAGE en_US.UTF-8',output.getvalue())
        self.language_reader.assert_not_called()
        self.language_writer.assert_not_called()
        self.assertEqual(list(self.home.iterdir()),[])

    def test_default_english_language_write_failure_rolls_back(self):
        install=self.installer('en')
        self.language_writer.side_effect=[RuntimeError('language rejected'),None]
        with patch.object(install,'doctor'):
            with self.assertRaisesRegex(RuntimeError,'language rejected'):
                install.install(options(apply=True))
        self.assertEqual([call.args[0] for call in self.language_writer.call_args_list],['en_US.UTF-8','zh_CN'])
        self.assertFalse((install.data/'gnome-shell/extensions'/EXTENSION).exists())
        self.assertFalse((install.state/'current.json').exists())

    def test_preserve_input_keeps_config_dictionaries_and_startup_untouched(self):
        install = self.installer('zh')
        originals = [install.config/'fcitx5', install.data/'fcitx5/rime',
            install.config/'autostart', install.config/'environment.d',
            install.data/'fcitx5/themes/MacStyle-IME-Light']
        for path in originals:
            path.mkdir(parents=True)
            (path/'personal-data').write_text('keep existing data')
        (install.data/'fcitx5/rime/default.custom.yaml').write_text('personal schemas')
        (install.home/'.xinputrc').write_text('existing input method')
        before = {path: fingerprint(path) for path in originals}
        before[install.home/'.xinputrc'] = fingerprint(install.home/'.xinputrc')
        with patch.object(install, 'doctor'), patch.object(install, 'schedule_activation'):
            install.install(options(apply=True, backup_existing=True, preserve_input=True))
        for path, digest in before.items():
            self.assertEqual(fingerprint(path), digest, str(path))
        self.assertFalse((install.config/'autostart/fcitx5.desktop').exists())
        self.assertFalse((install.config/'environment.d/90-linux-beautify-fcitx5.conf').exists())
        install.restore(*install.current())
        for path, digest in before.items():
            self.assertEqual(fingerprint(path), digest, str(path))

    def test_cached_error_defers_until_shell_process_changes(self):
        install = self.installer('zh')
        real_fake = self.fake_command
        def cached(argv, check=True):
            if argv[:2] == ['gnome-extensions', 'info']:
                return subprocess.CompletedProcess(argv, 0, 'State: ERROR\n', '')
            return real_fake(argv, check)
        with patch.object(install, 'doctor'), patch('beautify.command', side_effect=cached), \
                patch('beautify.shell_session', return_value='old-shell'):
            install.install(options(apply=True, preserve_input=True))
            manifest, directory = install.current()
            self.assertTrue(manifest['activation_pending'])
            self.assertEqual(manifest['reload_session'], 'old-shell')
            self.assertFalse(manifest['extensions_disabled'])
            self.assertTrue((install.config/'autostart'/f'linux-beautify-activate-{manifest["id"]}.desktop').exists())
            install.activate(manifest, directory)
            self.assertFalse(any(c[:2] == ['gnome-extensions', 'disable'] for c in self.calls))
        install.restore(*install.current())
        self.assertFalse(list((install.config/'autostart').glob('linux-beautify-activate-*.desktop')))

    def test_defer_refuses_before_mutation_if_shell_identity_unknown(self):
        install = self.installer('zh')
        with patch.object(install, 'doctor'), patch('beautify.shell_session', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'Cannot identify'):
                install.install(options(apply=True, defer_activation=True))
        self.assertFalse((install.data/'gnome-shell/extensions'/EXTENSION).exists())

    def test_transient_import_error_is_not_a_terminal_failure(self):
        install = self.installer('zh')
        infos = iter(['State: ERROR\n', 'State: ACTIVE\n'])
        def commands(argv, check=True):
            out = next(infos) if argv[0] == 'gnome-extensions' else '(@as [],)\n'
            return subprocess.CompletedProcess(argv, 0, out, '')
        with patch('beautify.command', side_effect=commands), patch('beautify.time.sleep'):
            install.wait_active([EXTENSION])

    def test_activation_error_includes_registered_type_detail(self):
        install = self.installer('zh')
        def commands(argv, check=True):
            out = 'State: ERROR\n' if argv[0] == 'gnome-extensions' else "(['Type name example is already registered'],)\n"
            return subprocess.CompletedProcess(argv, 0, out, '')
        with patch('beautify.command', side_effect=commands):
            with self.assertRaisesRegex(RuntimeError, 'already registered'):
                install.wait_active([EXTENSION])

    def prepared_login(self):
        from activate_on_login import LoginActivation
        install = self.installer('zh')
        with patch.object(install, 'doctor'), patch('beautify.shell_session', return_value='old-shell'):
            install.install(options(apply=True, defer_activation=True, preserve_input=True))
        manifest, directory = install.current()
        activation = LoginActivation(install.state/'first-login'/manifest['id'])
        activation.installer = install
        return activation, manifest, directory

    def test_login_keeps_pending_and_legacy_unchanged_in_cached_shell(self):
        activation, manifest, directory = self.prepared_login()
        with patch('activate_on_login.shell_session', return_value='old-shell'), \
                patch.object(activation.installer, 'activate') as activate, \
                patch.object(activation.installer, 'restore') as restore:
            self.assertEqual(activation.run(), 75)
        activate.assert_not_called()
        restore.assert_not_called()
        self.assertTrue(activation.autostart.exists())

    def test_login_removes_autostart_only_after_two_health_checks(self):
        activation, manifest, directory = self.prepared_login()
        def activate(current, directory):
            current['activation_pending'] = False
            activation.installer.save(directory, current)
        with patch('activate_on_login.shell_session', return_value='fresh-shell'), \
                patch.object(activation.installer, 'activate', side_effect=activate), \
                patch.object(activation, 'health') as health, patch.object(activation, 'notify'), \
                patch('activate_on_login.time.sleep'):
            self.assertEqual(activation.run(), 0)
        self.assertEqual(health.call_count, 2)
        self.assertFalse(activation.autostart.exists())
        self.assertTrue(activation.current_matches())

    def test_login_failure_captures_error_and_restores_transaction(self):
        activation, manifest, directory = self.prepared_login()
        with patch('activate_on_login.shell_session', return_value='fresh-shell'), \
                patch.object(activation.installer, 'activate', side_effect=RuntimeError('registration failed')), \
                patch.object(activation.installer, 'activation_errors', return_value='exact GType stack'), \
                patch.object(activation, 'notify'), patch('activate_on_login.subprocess.run',
                    return_value=subprocess.CompletedProcess([], 0, 'shell error log', '')):
            self.assertEqual(activation.run(), 1)
        self.assertFalse(activation.autostart.exists())
        self.assertFalse(activation.current_matches())
        self.assertFalse((activation.installer.data/'gnome-shell/extensions'/EXTENSION).exists())
        self.assertIn('exact GType stack', activation.log.read_text())
        self.assertEqual((activation.root/'gnome-shell.log').read_text(), 'shell error log')

    def test_superseded_login_never_restores_another_installation(self):
        activation, manifest, directory = self.prepared_login()
        (activation.installer.state/'current.json').write_text('{"installation":"different"}')
        with patch.object(activation.installer, 'activate') as activate, \
                patch.object(activation.installer, 'restore') as restore:
            self.assertEqual(activation.run(), 0)
        activate.assert_not_called()
        restore.assert_not_called()
        self.assertFalse(activation.autostart.exists())


if __name__=='__main__':
    unittest.main()

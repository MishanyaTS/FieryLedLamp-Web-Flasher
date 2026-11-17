Fiery Lamp Control

Файлы хранятся непосредственно в этой папке репозитория и публикуются на HostiMan только вручную:
- FieryLampControl.exe — актуальная Windows-версия и файл автоматического обновления;
- FieryLampUpdater.exe — безопасная замена EXE после завершения программы;
- FieryLampControl.update.json — версия, URL и SHA-256 для Windows-автообновления;
- FieryLampControl.ipa — iOS-версия;
- FieryLampControl.apk — Android APK для прямого скачивания с сайта.

PUBLISH_WINDOWS_UPDATE.bat только обновляет Windows-файлы в этой папке репозитория.
Он НЕ запускает deploy-hostiman.yml и НЕ публикует файлы на HostiMan.
Публикация сайта выполняется отдельно вручную.
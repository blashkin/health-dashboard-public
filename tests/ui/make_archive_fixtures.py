"""Эталон для сверки страницы с Python: один архив, два объекта, временная папка.

Личных данных здесь нет: архивы синтетические, из tests/fixtures.py.
"""
import json, sys, zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from health_dashboard import pipeline, select

NAME = 'apple_health_export/\u044d\u043a\u0441\u043f\u043e\u0440\u0442.xml'


def reference(tmp, xml, name=NAME, compressed=True):
 """Архив и то, что по нему считает Python: (путь к zip, main, sleep).

 Настоящая выгрузка сжата, поэтому сжатие здесь по умолчанию: иначе проверка
 не касалась бы распаковки вовсе."""
 tmp = Path(tmp)
 archive = tmp / 'export.zip'
 method = zipfile.ZIP_DEFLATED if compressed else zipfile.ZIP_STORED
 with zipfile.ZipFile(archive, 'w', method) as z:
  z.writestr(name, xml)
 data = tmp / 'data'
 pipeline.run(archive, data, inventory_report=False)
 main = select.build_package(data)
 sleep = json.loads((data / 'monthly_sleep_windows.json').read_text(encoding='utf-8'))
 return archive, main, sleep


def bulk_xml(days=400, per_day=288):
 """Выгрузка размером в десятки мегабайт: пульс каждые пять минут, как у настоящих часов."""
 parts = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<!DOCTYPE HealthData [<!ELEMENT HealthData (Record)*>]>', '<HealthData locale="ru_RU">']
 head = ('<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" sourceVersion="10.4"'
         ' unit="count/min" startDate="%s %02d:%02d:00 +0300" endDate="%s %02d:%02d:00 +0300" value="%d"/>')
 import datetime as dt
 start = dt.date(2022, 1, 1)
 for i in range(days):
  day = (start + dt.timedelta(days=i)).isoformat()
  for slot in range(per_day):
   hh, mm = divmod(slot * 5, 60)
   parts.append(head % (day, hh, mm, day, hh, mm, 60 + slot % 40))
 parts.append('</HealthData>')
 return ''.join(parts)

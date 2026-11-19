"""Fixtures compartidas por las pruebas de la API."""
from __future__ import annotations

import socket

import pytest


def _puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


@pytest.fixture(scope='module')
def smtp():
    from aiosmtpd.controller import Controller

    class Buzon:
        def __init__(self):
            self.mensajes: list = []

        async def handle_DATA(self, server, session, envelope):
            self.mensajes.append(envelope)
            return '250 OK'

    buzon = Buzon()
    c = Controller(buzon, hostname='127.0.0.1', port=_puerto_libre())
    c.start()
    yield c.port, buzon
    c.stop()

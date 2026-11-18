"""Constantes compartidas por las pruebas de nucleo.

Viven en un módulo de nombre único (y no en conftest.py) porque con varios conftest.py en la misma
sesión de pytest el nombre ``conftest`` apunta al último cargado y ``from conftest import ...`` falla.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # los paquetes se importan desde la carpeta del proyecto

from anomalias import modelo as MA  # noqa: E402
from clinico import crecimiento as CR  # noqa: E402
from clinico import modelo as AC  # noqa: E402

CONFIG_RAPIDA = MA.Config(rondas=80)

# ------------------------------------------------------------ configuración clínica

REGLA_SIMPLE = ('eg_semanas', 'peso_nacer')
CFG = AC.ConfigClinica(
    desenlaces=(
        AC.Desenlace('readm', 'readmisión antes de los 3 meses', '40 sem', 'mayor_que_cero', 'readm_3m',
                     comparar=REGLA_SIMPLE),
        AC.Desenlace('no_vuelve', 'no vuelve a los 3 meses', '40 sem', 'no_vuelve', comparar=REGLA_SIMPLE),
        AC.Desenlace('oxigeno', 'oxígeno a los 3 meses', '40 sem', 'en_codigos', 'oxigeno_3m', codigos=(1.0,),
                     comparar=REGLA_SIMPLE),
        AC.Desenlace('desarrollo', 'desarrollo bajo a los 6 meses', '3 m EC', 'percentil_bajo', 'desarrollo_6m',
                     comparar=REGLA_SIMPLE),
    ),
    sexo='sexo', codigos_sexo=(('M', 1), ('F', 2)),
    medidas=(CR.Medida('peso', 'peso', factor=0.001, restringido=True), CR.Medida('talla', 'talla'),
             CR.Medida('perimetro_cefalico', 'perimetro_cefalico')),
    etapas_crecimiento=('40 sem', '3 m EC', '6 m EC', '12 m EC'),
    rondas=150, min_casos=20,
)

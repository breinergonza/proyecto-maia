"""Genera referencias.tex con las entradas en orden de primera cita (estilo IEEE).

Uso:  python herramientas/ordenar_referencias.py
Lee articulo.tex siguiendo los \\input en orden, toma las claves de \\cite{...}
y escribe referencias.tex con solo las referencias citadas, en orden de aparición.
Para agregar una referencia: añadirla a REFS (clave -> texto IEEE) y citarla.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

REFS = {
    # --- Referencias de la propuesta de grado ---
    "fenton2013": r"T.~R. Fenton and J.~H. Kim, ``A systematic review and meta-analysis to revise the Fenton growth chart for preterm infants,'' \emph{BMC Pediatrics}, vol.~13, art.~59, 2013.",
    "oms2006": r"World Health Organization, \emph{WHO Child Growth Standards: Length/Height-for-Age, Weight-for-Age, Weight-for-Length, Weight-for-Height and Body Mass Index-for-Age: Methods and Development}. Geneva: WHO, 2006.",
    "oms2022": r"World Health Organization, \emph{WHO Recommendations for Care of the Preterm or Low-Birth-Weight Infant}. Geneva: WHO, 2022.",
    "charpak2017": r"N. Charpak, R. Tessier, J.~G. Ruiz \emph{et al.}, ``Twenty-year follow-up of kangaroo mother care versus traditional care,'' \emph{Pediatrics}, vol.~139, no.~1, e20162063, 2017.",
    "charpak2023": r"N. Charpak and A. Montealegre-Pomar, ``Follow-up of Kangaroo Mother Care programmes in the last 28 years: results from a cohort of 57\,154 low-birth-weight infants in Colombia,'' \emph{BMJ Global Health}, vol.~8, no.~5, 2023.",
    "victora2021": r"C.~G. Victora, P. Christian, L.~P. Vidaletti, G. Gatica-Domínguez, P. Menon, and R.~E. Black, ``Revisiting maternal and child undernutrition in low-income and middle-income countries: variable progress towards an unfinished agenda,'' \emph{The Lancet}, vol.~397, no.~10282, pp.~1382--1396, 2021.",
    "fundacion2026": r"Fundación Canguro, ``Proyecto final de la maestría en Inteligencia Artificial: Crecimiento y riesgos en el niño prematuro o de bajo peso al nacer (KMC-12mCA-Growing and Risks),'' propuesta y documentación institucional, 2026.",
    "ren2024": r"Z. Ren, W. Gao, Q. Wang \emph{et al.}, ``Predictive role of NICU-related stress, postpartum depression trajectory and family coping on growth trajectory of moderate-to-late preterm infants: A longitudinal study,'' \emph{Journal of Advanced Nursing}, vol.~80, no.~8, pp.~3167--3178, 2024, doi: 10.1111/jan.16068.",
    "baker2023": r"S. Baker and Y. Kandasamy, ``Machine learning for understanding and predicting neurodevelopmental outcomes in premature infants: a systematic review,'' \emph{Pediatric Research}, vol.~93, pp.~293--299, 2023.",
    "demirci2024": r"G.~M. Demirci \emph{et al.}, ``Predicting mental and psychomotor delay in very pre-term infants using machine learning,'' \emph{Pediatric Research}, vol.~95, pp.~668--678, 2024.",
    "mlrisk2024": r"``Machine learning risk stratification for high-risk infant follow-up of term and late preterm infants,'' \emph{Pediatric Research}, 2024, doi: 10.1038/s41390-024-03338-6.",
    "wang2024": r"L.-Y. Wang, L.-Y. Wang, M.-I. Sung \emph{et al.}, ``Implementing explainable machine learning models for practical prediction of early neonatal hypoglycemia,'' \emph{Diagnostics}, vol.~14, no.~14, art.~1571, 2024, doi: 10.3390/diagnostics14141571.",
    "salih2024": r"A.~M. Salih, G. Menegaz, T. Pillay, and E.~M. Boyle, ``Explainable artificial intelligence in paediatric: Challenges for the future,'' \emph{Health Science Reports}, vol.~7, no.~12, e70271, 2024, doi: 10.1002/hsr2.70271.",
    "nel2026": r"S. Nel, U.~D. Feucht, T. Botha, M. Arashi, and F.~A.~M. Wenhold, ``First-year growth patterns of preterm infants receiving kangaroo mother care: associations with early life factors and 1-year anthropometry,'' \emph{European Journal of Clinical Nutrition}, vol.~80, pp.~62--72, 2026, doi: 10.1038/s41430-025-01662-6.",
    "melo2016": r"S.~E. Melo, O.~O. Melo, and N. Suarez, ``Modelo multinivel de tasa global de ganancia de peso en el programa madre canguro en Bogotá,'' \emph{Revista de Salud Pública}, vol.~18, no.~2, pp.~238--250, 2016, doi: 10.15446/rsap.v18n2.44661.",
    # --- Referencias nuevas del alcance ajustado ---
    "villar2015": r"J. Villar, F. Giuliani, Z.~A. Bhutta \emph{et al.}, ``Postnatal growth standards for preterm infants: the Preterm Postnatal Follow-up Study of the INTERGROWTH-21st Project,'' \emph{The Lancet Global Health}, vol.~3, no.~11, pp.~e681--e691, 2015, doi: 10.1016/S2214-109X(15)00163-1.",
    "kahn2016": r"M.~G. Kahn, T.~J. Callahan, J. Barnard \emph{et al.}, ``A harmonized data quality assessment terminology and framework for the secondary use of electronic health record data,'' \emph{eGEMs}, vol.~4, no.~1, art.~1244, 2016, doi: 10.13063/2327-9214.1244.",
    "weiskopf2013": r"N.~G. Weiskopf and C. Weng, ``Methods and dimensions of electronic health record data quality assessment: enabling reuse for clinical research,'' \emph{Journal of the American Medical Informatics Association}, vol.~20, no.~1, pp.~144--151, 2013.",
    "chandola2009": r"V. Chandola, A. Banerjee, and V. Kumar, ``Anomaly detection: A survey,'' \emph{ACM Computing Surveys}, vol.~41, no.~3, art.~15, 2009.",
    "koenker1978": r"R. Koenker and G. Bassett, ``Regression quantiles,'' \emph{Econometrica}, vol.~46, no.~1, pp.~33--50, 1978.",
    "romano2019": r"Y. Romano, E. Patterson, and E. Candès, ``Conformalized quantile regression,'' in \emph{Advances in Neural Information Processing Systems}, vol.~32, 2019.",
    "angelopoulos2023": r"A.~N. Angelopoulos and S. Bates, ``Conformal prediction: A gentle introduction,'' \emph{Foundations and Trends in Machine Learning}, vol.~16, no.~4, pp.~494--591, 2023.",
    "vancalster2019": r"B. Van Calster, D.~J. McLernon, M. van Smeden, L. Wynants, and E.~W. Steyerberg, ``Calibration: the Achilles heel of predictive analytics,'' \emph{BMC Medicine}, vol.~17, art.~230, 2019.",
    "davis2017": r"S.~E. Davis, T.~A. Lasko, G. Chen, and M.~E. Matheny, ``Calibration drift among regression and machine learning models for hospital mortality,'' in \emph{AMIA Annual Symposium Proceedings}, vol.~2017, pp.~625--634, 2017.",
    "wong2021": r"A. Wong, E. Otles, J.~P. Donnelly \emph{et al.}, ``External validation of a widely implemented proprietary sepsis prediction model in hospitalized patients,'' \emph{JAMA Internal Medicine}, vol.~181, no.~8, pp.~1065--1070, 2021, doi: 10.1001/jamainternmed.2021.2626.",
    "page1954": r"E.~S. Page, ``Continuous inspection schemes,'' \emph{Biometrika}, vol.~41, no.~1/2, pp.~100--115, 1954.",
    "lundberg2020": r"S.~M. Lundberg, G. Erion, H. Chen \emph{et al.}, ``From local explanations to global understanding with explainable AI for trees,'' \emph{Nature Machine Intelligence}, vol.~2, no.~1, pp.~56--67, 2020.",
    "ghassemi2021": r"M. Ghassemi, L. Oakden-Rayner, and A.~L. Beam, ``The false hope of current approaches to explainable artificial intelligence in health care,'' \emph{The Lancet Digital Health}, vol.~3, no.~11, pp.~e745--e750, 2021.",
    "collins2024": r"G.~S. Collins, K.~G.~M. Moons, P. Dhiman \emph{et al.}, ``TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods,'' \emph{BMJ}, vol.~385, e078378, 2024.",
    "kreuzberger2023": r"D. Kreuzberger, N. Kühl, and S. Hirschl, ``Machine learning operations (MLOps): Overview, definition, and architecture,'' \emph{IEEE Access}, vol.~11, pp.~31866--31879, 2023, doi: 10.1109/ACCESS.2023.3262138.",
    "zaharia2018": r"M. Zaharia, A. Chen, A. Davidson \emph{et al.}, ``Accelerating the machine learning lifecycle with MLflow,'' \emph{IEEE Data Engineering Bulletin}, vol.~41, no.~4, pp.~39--45, 2018.",
    "designcouncil2007": r"Design Council, \emph{Eleven Lessons: Managing Design in Eleven Global Companies}. London: Design Council, 2007.",
    "brown2008": r"T. Brown, ``Design thinking,'' \emph{Harvard Business Review}, vol.~86, no.~6, pp.~84--92, 2008.",
    "ke2017": r"G. Ke, Q. Meng, T. Finley \emph{et al.}, ``LightGBM: A highly efficient gradient boosting decision tree,'' in \emph{Advances in Neural Information Processing Systems}, vol.~30, pp.~3146--3154, 2017.",
    "omsunicef2019": r"World Health Organization and UNICEF, \emph{Recommendations for Data Collection, Analysis and Reporting on Anthropometric Indicators in Children under 5 Years Old}. Geneva: WHO, 2019.",
}


def texto_expandido(archivo: Path) -> str:
    t = archivo.read_text(encoding="utf-8")
    t = re.sub(r"(?m)(?<!\\)%.*$", "", t)  # quita comentarios
    def sub(m):
        nombre = m.group(1)
        p = RAIZ / (nombre if nombre.endswith(".tex") else nombre + ".tex")
        return texto_expandido(p) if p.exists() and p.name != "referencias.tex" else ""
    return re.sub(r"\\input\{([^}]+)\}", sub, t)


def main() -> int:
    texto = texto_expandido(RAIZ / "articulo.tex")
    orden = []
    for grupo in re.findall(r"\\cite\{([^}]+)\}", texto):
        for clave in (c.strip() for c in grupo.split(",")):
            if clave not in orden:
                orden.append(clave)
    faltan = [c for c in orden if c not in REFS]
    if faltan:
        print("Claves citadas sin referencia:", ", ".join(faltan))
        return 1
    sin_citar = [c for c in REFS if c not in orden]
    lineas = ["% Generado por herramientas/ordenar_referencias.py: no editar a mano.",
              "% Orden de primera cita (IEEE).",
              "\\begin{thebibliography}{%d}" % len(orden)]
    for c in orden:
        lineas.append("\\bibitem{%s}\n%s\n" % (c, REFS[c]))
    lineas.append("\\end{thebibliography}")
    (RAIZ / "referencias.tex").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"{len(orden)} referencias en orden de aparición.")
    if sin_citar:
        print("Sin citar (omitidas):", ", ".join(sin_citar))
    return 0


if __name__ == "__main__":
    sys.exit(main())

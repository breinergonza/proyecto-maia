"""Shared chart style for the report: validated palette, recessive axes, direct labels."""
from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

# First three categorical slots of the reference palette: they validate all-pairs
# for colour-vision deficiency. Slot 3 is below 3:1 contrast, so every series
# chart carries direct labels and its data is also shown as a table.
SERIES = ('#2a78d6', '#eb6834', '#1baf7a')
INK, INK_2, MUTED, GRID, AXIS = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7'
CRITICAL = '#d03b3b'
BLUES = LinearSegmentedColormap.from_list('blues', ['#f4f8fd', '#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'])
DIVERGING = LinearSegmentedColormap.from_list('div', ['#1c5cab', '#86b6ef', '#f0efec', '#f0a3a3', '#b02e2e'])


def use_style() -> None:
    plt.rcParams.update({
        'figure.dpi': 110, 'savefig.dpi': 150, 'figure.facecolor': '#fcfcfb', 'axes.facecolor': '#fcfcfb',
        'font.family': ['Segoe UI', 'DejaVu Sans'], 'font.size': 10,
        'axes.edgecolor': AXIS, 'axes.labelcolor': INK_2, 'axes.titlecolor': INK, 'axes.titlesize': 12,
        'axes.titleweight': 'bold', 'axes.titlelocation': 'left', 'axes.spines.top': False,
        'axes.spines.right': False, 'axes.grid': True, 'grid.color': GRID, 'grid.linewidth': 0.6,
        'xtick.color': MUTED, 'ytick.color': MUTED, 'legend.frameon': False, 'lines.linewidth': 2,
    })


def group_color(groups: list[object]) -> dict[object, str]:
    """Colour follows the entity: assigned in sorted order, never by rank."""
    return {g: SERIES[i % len(SERIES)] for i, g in enumerate(sorted(groups))}


def _break_gaps(d: pd.DataFrame, x: str, step) -> pd.DataFrame:
    """Insert an empty row wherever consecutive x values are further apart than the usual step,
    so a missing period shows as a break instead of a straight line across it."""
    gaps = d[x].diff() > step * 1.5
    if not gaps.any():
        return d
    breaks = d.loc[gaps, [x]].copy()
    breaks[x] = d[x].shift()[gaps] + step
    return pd.concat([d, breaks]).sort_values(x)


def _spread(values: list[float], min_gap: float) -> list[float]:
    """Push sorted label positions apart so no two are closer than ``min_gap``."""
    order = np.argsort(values)
    out = np.array(values, dtype=float)
    for prev, cur in zip(order, order[1:]):
        out[cur] = max(out[cur], out[prev] + min_gap)
    return out.tolist()


def lines_by_group(df: pd.DataFrame, x: str, y: str, group: str, title: str, ylabel: str,
                   label: str = 'Sede {}', ax: plt.Axes | None = None, baseline: float | None = None) -> plt.Axes:
    ax = ax or plt.subplots(figsize=(10, 4))[1]
    colors = group_color(df[group].dropna().unique().tolist())
    step = pd.Series(np.sort(df[x].dropna().unique())).diff().median()
    ends = []
    for g, d in df.sort_values(x).groupby(group):
        name = label.format(int(g) if isinstance(g, (int, float, np.number)) and float(g).is_integer() else g)
        d = _break_gaps(d, x, step)
        ax.plot(d[x], d[y], color=colors[g], label=name)
        alone = d[y].notna() & d[y].shift().isna() & d[y].shift(-1).isna()
        ax.plot(d.loc[alone, x], d.loc[alone, y], 'o', color=colors[g], markersize=4)  # a line needs two points
        last = d.dropna(subset=[y]).iloc[-1]
        ends.append((name, last[x], last[y]))
    if baseline is not None:
        ax.axhline(baseline, color=AXIS, linewidth=1)
    if pd.api.types.is_numeric_dtype(df[x]):
        ax.xaxis.set_major_locator(plt.MaxNLocator(integer=True))
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    if len(colors) > 1:  # one line: its end label says it all
        ax.legend(loc='upper left', ncols=len(colors))
    ax.margins(x=0.06)
    # Direct labels at the line ends, nudged apart in screen space so they never overlap.
    ax.autoscale_view()
    to_px = ax.transData.transform
    px = [to_px((mdates_num(xv), yv))[1] for _, xv, yv in ends]
    dpi = ax.figure.dpi
    for (name, xv, yv), y0, y1 in zip(ends, px, _spread(px, 13 * dpi / 72)):
        ax.annotate(name, (xv, yv), xytext=(6, (y1 - y0) * 72 / dpi), textcoords='offset points',
                    va='center', color=INK_2, fontsize=9)
    return ax


def mdates_num(v) -> float:
    """Matplotlib's numeric position for a value (dates become day numbers)."""
    from matplotlib.dates import date2num
    return date2num(v) if isinstance(v, (pd.Timestamp, np.datetime64)) else float(v)


def _label(fmt, v: float) -> str:
    return fmt(v) if callable(fmt) else fmt.format(v)


def barh(series: pd.Series, title: str, xlabel: str, fmt='{:,.0f}', color: str = SERIES[0],
         ax: plt.Axes | None = None) -> plt.Axes:
    s = series.sort_values()
    ax = ax or plt.subplots(figsize=(9, 0.32 * len(s) + 1))[1]
    ax.barh(s.index.astype(str), s.to_numpy(), color=color, height=0.65)
    for i, v in enumerate(s.to_numpy()):
        ax.annotate(_label(fmt, v), (v, i), xytext=(4, 0), textcoords='offset points', va='center',
                    color=INK_2, fontsize=9)
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.grid(axis='y', visible=False)
    ax.margins(x=0.12)
    return ax


def heatmap(table: pd.DataFrame, title: str, cbar_label: str, fmt='{:.0f}', cmap=BLUES,
            vmin: float | None = None, vmax: float | None = None, center: float | None = None,
            ax: plt.Axes | None = None, figsize: tuple[float, float] | None = None) -> plt.Axes:
    ax = ax or plt.subplots(figsize=figsize or (max(6, 0.55 * table.shape[1] + 3), 0.38 * table.shape[0] + 1.5))[1]
    values = table.to_numpy(dtype=float)
    if center is not None:
        span = np.nanmax(np.abs(values - center))
        vmin, vmax = center - span, center + span
    im = ax.imshow(values, cmap=cmap, aspect='auto', vmin=vmin, vmax=vmax)
    ax.set_xticks(range(table.shape[1]), [str(c) for c in table.columns], rotation=0)
    ax.set_yticks(range(table.shape[0]), [str(i) for i in table.index])
    ax.grid(False)
    lo, hi = im.get_clim()
    for (i, j), v in np.ndenumerate(values):
        if np.isfinite(v):
            dark = (v - lo) / (hi - lo or 1) > 0.6 if center is None else abs(v - center) / (hi - center or 1) > 0.6
            ax.text(j, i, _label(fmt, v), ha='center', va='center', fontsize=8, color='white' if dark else INK)
    ax.set_title(title)
    cb = plt.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    cb.set_label(cbar_label, color=INK_2)
    cb.outline.set_visible(False)
    return ax

import { zodResolver } from '@hookform/resolvers/zod'
import { Activity, ArrowRight, Baby, BrainCircuit, Eye, EyeOff, HeartPulse, Info, Lock, Mail, ScanSearch, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { ErrorApi } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { AvisoDemo, Marca } from '../components/Marco'
import { Aviso, Boton, Entrada } from '../components/ui'

const esquema = z.object({
  email: z.string().trim().min(1, 'Escriba su correo.').email('Ese correo no es válido.'),
  clave: z.string().min(1, 'Escriba su contraseña.'),
})
type Datos = z.infer<typeof esquema>

const SELLOS = [
  { icono: ScanSearch, texto: 'Anomalías por capa' },
  { icono: Activity, texto: 'Riesgo de desenlaces prevenibles' },
  { icono: TrendingUp, texto: 'Crecimiento frente a la OMS' },
  { icono: BrainCircuit, texto: 'IA interpretable' },
  { icono: Users, texto: 'Revisión de expertos' },
  { icono: ShieldCheck, texto: 'Códigos seudonimizados' },
  { icono: Baby, texto: 'Programa Madre Canguro' },
]

/** Retraso de una animación de entrada, para escalonar los elementos. */
const tras = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

export default function Ingresar() {
  const { usuario, cargando, ingresar } = useSesion()
  const ir = useNavigate()
  const lugar = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [verClave, setVerClave] = useState(false)
  const [olvido, setOlvido] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Datos>({ resolver: zodResolver(esquema) })

  if (!cargando && usuario) return <Navigate to="/" replace />

  const enviar = async (d: Datos) => {
    setError(null)
    try {
      await ingresar(d.email, d.clave)
      ir((lugar.state as { desde?: string } | null)?.desde ?? '/', { replace: true })
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No hubo respuesta de la API. Revise su conexión.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <AvisoDemo />
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1.12fr_1fr]">
        {/* presentación: en el teléfono es una cabecera corta; el gráfico y los sellos aparecen con más espacio */}
        <section className="relative isolate flex flex-col gap-8 overflow-hidden lg:gap-5 bg-[linear-gradient(160deg,#18443f_0%,#12312f_48%,#0b2321_100%)] px-6 pb-20 pt-6 text-white sm:px-10 sm:pb-24 lg:justify-between lg:px-14 lg:pb-8 lg:pt-8">
          <Fondo />
          <Circuito />
          <div className="animate-aparecer"><Marca claro /></div>

          <div className="max-w-[31rem]">
            <p className="animate-subir text-xs font-medium uppercase tracking-[0.2em] text-white/60 sm:text-sm" style={tras(0.1)}>
              Programa Madre Canguro
            </p>
            <p className="mt-3 animate-subir text-[1.7rem] font-bold leading-[1.12] tracking-tight sm:max-w-[26rem] sm:text-4xl lg:max-w-[22rem] lg:text-[2.3rem] xl:max-w-[26rem] xl:text-[2.6rem]" style={tras(0.2)}>
              Cada visita del niño prematuro cuenta <span className="text-[#ef8d6f]">cómo crece.</span>
            </p>
            <p className="mt-4 hidden max-w-[42ch] animate-subir text-white/75 sm:block lg:text-[1.05rem]" style={tras(0.35)}>
              El observatorio lee la historia completa: señala los datos que conviene revisar y ordena a los niños por
              el riesgo de lo que se puede prevenir.
            </p>
          </div>

          <div className="hidden animate-subir lg:block" style={tras(0.45)}><Grafico /></div>

          <Cinta />
        </section>

        {/* formulario: tarjeta que en el teléfono se monta sobre la cabecera */}
        <section className="relative z-10 -mt-12 flex flex-1 flex-col items-center px-4 pb-10 sm:-mt-14 sm:px-10 lg:mt-0 lg:justify-center lg:py-12">
          <div className="w-full max-w-[26rem] animate-subir" style={tras(0.2)}>
            <form onSubmit={handleSubmit(enviar)} noValidate
              className="space-y-5 rounded-[1.75rem] bg-papel p-6 shadow-[0_28px_60px_-28px_rgb(20_38_42/0.45)] ring-1 ring-tinta/[0.04] sm:p-8">
              <div>
                <span className="grid size-14 place-items-center rounded-2xl bg-teal-tinte text-teal" aria-hidden>
                  <HeartPulse size={28} />
                </span>
                <h1 className="mt-5">Ingresar</h1>
                <p className="mt-1.5 text-salvia">Acceda a la plataforma de monitoreo y alertas clínicas.</p>
              </div>

              {error && <Aviso>{error}</Aviso>}

              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-semibold text-tinta/90">Correo electrónico</label>
                  <ConIcono icono={<Mail size={18} />}>
                    <Entrada id="email" type="email" inputMode="email" autoComplete="username" autoFocus
                      placeholder="ejemplo@fundacion.org" className="pl-11" aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} />
                  </ConIcono>
                  {errors.email && <p id="email-error" className="text-sm text-coral-hondo" role="alert">{errors.email.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="clave" className="text-sm font-semibold text-tinta/90">Contraseña</label>
                    <button type="button" onClick={() => setOlvido((v) => !v)} aria-expanded={olvido} aria-controls="olvido"
                      className="rounded text-sm text-teal-medio underline-offset-2 hover:text-teal hover:underline">
                      ¿Olvidó su contraseña?
                    </button>
                  </div>
                  <ConIcono icono={<Lock size={18} />}>
                    <Entrada id="clave" type={verClave ? 'text' : 'password'} autoComplete="current-password"
                      className="pl-11 pr-12" aria-invalid={!!errors.clave}
                      aria-describedby={errors.clave ? 'clave-error' : undefined} {...register('clave')} />
                    <button type="button" onClick={() => setVerClave((v) => !v)}
                      aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verClave}
                      className="absolute inset-y-0 right-1 my-auto grid size-9 place-items-center rounded-control text-salvia transition-colors hover:bg-fondo hover:text-tinta">
                      {verClave ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                    </button>
                  </ConIcono>
                  {errors.clave && <p id="clave-error" className="text-sm text-coral-hondo" role="alert">{errors.clave.message}</p>}
                  <div id="olvido" hidden={!olvido}>
                    <Aviso tono="teal">
                      Pídale a la administración del observatorio una contraseña nueva: se asigna en Administración ›
                      Usuarios y se la comparten por un canal seguro.
                    </Aviso>
                  </div>
                </div>
              </div>

              <Boton type="submit" className="group h-12 w-full rounded-xl text-base" disabled={isSubmitting}>
                {isSubmitting ? 'Ingresando…' : 'Ingresar al sistema'}
                {!isSubmitting && <ArrowRight size={18} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />}
              </Boton>

              <p className="flex gap-2.5 rounded-xl bg-fondo px-3.5 py-3 text-[0.8rem] leading-snug text-salvia">
                <Info size={17} aria-hidden className="mt-px shrink-0" />
                Apoyo a la decisión clínica, no sustituye el diagnóstico médico.
              </p>
            </form>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-salvia">
              <Lock size={13} aria-hidden /> Acceso seguro con conexión cifrada.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

/** Cinta de sellos en movimiento continuo; la lista va dos veces para que el bucle no tenga corte. */
function Cinta() {
  return (
    <div className="relative -mx-6 animate-aparecer overflow-hidden border-t border-white/10 pt-4 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)] sm:-mx-10 lg:-mx-14"
      style={tras(0.6)}>
      <div className="flex w-max animate-cinta gap-2 hover:[animation-play-state:paused]">
        {[0, 1].map((copia) => (
          <ul key={copia} className="flex gap-2" aria-hidden={copia === 1 || undefined}
            aria-label={copia === 0 ? 'Lo que hace el observatorio' : undefined}>
            {SELLOS.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm xl:px-3.5 xl:text-[0.8rem]">
                <Icono size={15} aria-hidden className="text-[#7fd3c6]" />{texto}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}

/** Un campo con su icono a la izquierda. */
function ConIcono({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 my-auto grid place-items-center text-salvia" aria-hidden>{icono}</span>
      {children}
    </div>
  )
}

/** Brillos y una trama de puntos que flotan despacio detrás del texto. */
function Fondo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-24 -top-24 size-80 animate-flotar rounded-full bg-teal-medio/45 blur-3xl" />
      <div className="absolute -right-20 top-1/4 size-80 animate-flotar rounded-full bg-[#2a8a7c]/25 blur-3xl" style={tras(-3)} />
      <div className="absolute -bottom-24 left-1/3 size-72 animate-flotar rounded-full bg-[#3fbfa8]/15 blur-3xl" style={tras(-6)} />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(180deg,transparent,black_35%,black)]" />
    </div>
  )
}

/** Un chip «IA» con pistas de circuito que llegan a él: decorativo, arriba a la derecha. */
function Circuito() {
  // cada pista va del borde al chip, que ocupa de (170, 80) a (230, 140)
  const pistas = [
    [[20, 40], [110, 40], [140, 70], [170, 70]],
    [[0, 110], [170, 110]],
    [[30, 175], [120, 175], [150, 150], [170, 150]],
    [[200, 0], [200, 80]],
    [[260, 0], [260, 40], [230, 70], [230, 80]],
    [[380, 60], [300, 60], [270, 85], [230, 85]],
    [[380, 130], [230, 130]],
    [[360, 200], [290, 200], [250, 160], [230, 160]],
    [[200, 220], [200, 140]],
  ]
  const ruta = (p: number[][]) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  return (
    <svg viewBox="0 0 380 220" aria-hidden
      className="pointer-events-none absolute -z-10 hidden w-[17rem] opacity-80 md:right-4 md:top-10 md:block lg:w-[15rem] xl:right-8 xl:top-12 xl:w-[19rem]">
      <defs>
        <filter id="brillo-ia" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {pistas.map((p, n) => (
        <g key={n}>
          <path d={ruta(p)} fill="none" stroke="#7fd3c6" strokeOpacity="0.28" strokeWidth="1.4" />
          <path d={ruta(p)} fill="none" stroke="#a8f0e2" strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round"
            pathLength={100} strokeDasharray="8 92" className="animate-flujo" style={tras(-n * 0.7)} />
          <circle cx={p[0][0]} cy={p[0][1]} r="2.6" fill="#7fd3c6" fillOpacity="0.7" />
        </g>
      ))}
      <g filter="url(#brillo-ia)">
        <rect x="170" y="80" width="60" height="60" rx="10" fill="#164a44" stroke="#a8f0e2" strokeOpacity="0.85" strokeWidth="1.5" />
      </g>
      <rect x="177" y="87" width="46" height="46" rx="6" fill="none" stroke="#a8f0e2" strokeOpacity="0.25" />
      <text x="200" y="117" textAnchor="middle" fontSize="20" fontWeight="700" fill="#d8fff7">IA</text>
    </svg>
  )
}

/** Tarjeta de vidrio con una curva de crecimiento de ejemplo frente a la banda de la OMS (sin datos de nadie). */
function Grafico() {
  const x = (v: number) => 34 + ((v - 20) / 80) * 390          // eje x: 20 a 100
  const y = (v: number) => 196 - (v / 100) * 170               // eje y: 0 a 100
  const nino = [[20, 18], [30, 27], [40, 40], [50, 46], [60, 56], [70, 60], [80, 64], [90, 74]]
  const alto = [[20, 14], [40, 26], [60, 38], [80, 50], [100, 62]]
  const bajo = [[20, 4], [40, 14], [60, 25], [80, 36], [100, 46]]
  const curva = (p: number[][]) => p.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a)},${y(b)}`).join(' ')
  const banda = `${curva(alto)} ${[...bajo].reverse().map(([a, b]) => `L${x(a)},${y(b)}`).join(' ')} Z`
  const [ax, ay] = nino[5].map((v, i) => (i ? y(v) : x(v)))
  return (
    <div className="max-w-[27rem] rounded-2xl xl:max-w-[32rem] border border-white/15 bg-white/[0.06] p-3 shadow-[0_0_70px_-12px_rgb(94_234_212/0.35)] backdrop-blur-md">
      <svg viewBox="0 0 440 220" className="w-full" aria-hidden>
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={34} x2={424} y1={y(v)} y2={y(v)} stroke="white" strokeOpacity="0.08" />
            <text x={26} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="white" fillOpacity="0.45">{v}</text>
          </g>
        ))}
        {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={y(100)} y2={y(0)} stroke="white" strokeOpacity="0.05" />
            <text x={x(v)} y={212} textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.45">{v}</text>
          </g>
        ))}
        <path d={banda} fill="#7fd3c6" fillOpacity="0.14" />
        <path d={curva(alto)} fill="none" stroke="#a8f0e2" strokeOpacity="0.5" strokeWidth="1.5" />
        <path d={curva(bajo)} fill="none" stroke="#a8f0e2" strokeOpacity="0.3" strokeWidth="1.2" />
        <rect x={ax - 9} y={ay} width={18} height={y(0) - ay} rx={3} fill="#ef8d6f" fillOpacity="0.22"
          className="animate-aparecer" style={tras(2.2)} />
        <path d={curva(nino)} fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"
          pathLength={1} strokeDasharray={1} className="animate-trazar" />
        {nino.map(([a, b], i) => i === 5 ? (
          <g key={i} className="animate-aparecer" style={tras(0.4 + i * 0.25)}>
            <circle cx={x(a)} cy={y(b)} r={6} fill="#ef8d6f" className="animate-latir [transform-box:fill-box] [transform-origin:center]" />
            <circle cx={x(a)} cy={y(b)} r={6} fill="#ef8d6f" stroke="white" strokeWidth="1.5" />
          </g>
        ) : (
          <circle key={i} cx={x(a)} cy={y(b)} r={4} fill="white" className="animate-aparecer" style={tras(0.4 + i * 0.25)} />
        ))}
        <Etiqueta x={42} y={10} punto="#a8f0e2" texto="Percentil OMS" />
        <Etiqueta x={262} y={10} punto="white" texto="Predicción de crecimiento IA" />
        <g className="animate-aparecer" style={tras(2.4)}>
          <rect x={ax + 14} y={ay + 6} width={104} height={22} rx={11} fill="#d9694c" fillOpacity="0.9" />
          <circle cx={ax + 26} cy={ay + 17} r={3} fill="white" />
          <text x={ax + 34} y={ay + 20.5} fontSize="10" fontWeight="600" fill="white">Riesgo moderado</text>
        </g>
      </svg>
    </div>
  )
}

function Etiqueta({ x, y, punto, texto }: { x: number; y: number; punto: string; texto: string }) {
  const ancho = 26 + texto.length * 5.2
  return (
    <g>
      <rect x={x} y={y} width={ancho} height={20} rx={10} fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.15" />
      <circle cx={x + 11} cy={y + 10} r={3} fill={punto} />
      <text x={x + 19} y={y + 13.5} fontSize="9.5" fill="white" fillOpacity="0.85">{texto}</text>
    </g>
  )
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { ErrorApi } from './api/cliente'
import { ProveedorSesion, Requiere } from './auth/sesion'
import { Marco, ROLES_ADMIN, ROLES_CLINICOS, ROLES_CONSULTA } from './components/Marco'

import Ingresar from './paginas/Ingresar'

// Cada página se descarga cuando se abre: la primera carga queda liviana.
const AdminCalidadDatos = lazy(() => import('./paginas/AdminCalidadDatos'))
const AdminConfiguracion = lazy(() => import('./paginas/AdminConfiguracion'))
const AdminCorridas = lazy(() => import('./paginas/AdminCorridas'))
const AdminEntrenamientos = lazy(() => import('./paginas/AdminEntrenamientos'))
const AdminModelos = lazy(() => import('./paginas/AdminModelos'))
const NotifServidor = lazy(() => import('./paginas/NotifServidor'))
const NotifAlertas = lazy(() => import('./paginas/NotifAlertas'))
const AdminProgramacion = lazy(() => import('./paginas/AdminProgramacion'))
const AdminUsuarios = lazy(() => import('./paginas/AdminUsuarios'))
const Diccionario = lazy(() => import('./paginas/Diccionario'))
const Explorar = lazy(() => import('./paginas/Explorar'))
const PrediccionMarco = lazy(() => import('./paginas/PrediccionMarco'))
const MisModelos = lazy(() => import('./paginas/MisModelos'))
const Nino = lazy(() => import('./paginas/Nino'))
const Ninos = lazy(() => import('./paginas/Ninos'))
const RevisionRiesgos = lazy(() => import('./paginas/RevisionRiesgos'))
const Tablero = lazy(() => import('./paginas/Tablero'))
const VistaClinica = lazy(() => import('./paginas/VistaClinica'))
const CompararGrupos = lazy(() => import('./components/clinica/CompararGrupos'))
const AnaliticaLayout = lazy(() => import('./paginas/AnaliticaLayout'))
const SubmoduloAnalitica = lazy(() => import('./paginas/analitica/Submodulo'))

export function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (n, e) => !(e instanceof ErrorApi && e.estado < 500) && n < 2,
      },
    },
  })
}

const cliente = crearCliente()

/** /analitica abre el resumen y conserva el contexto de la URL (?entrenamiento=&desenlace=). */
function ARresumen() {
  return <Navigate to={{ pathname: '/analitica/resumen', search: useLocation().search }} replace />
}

export function Rutas() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingresar />} />
      <Route element={<Requiere><Marco /></Requiere>}>
        <Route index element={<VistaClinica />} />
        <Route path="tablero" element={<Tablero />} />
        <Route path="comparar" element={<Requiere roles={ROLES_CONSULTA}><CompararGrupos /></Requiere>} />
        <Route path="explorar" element={<Requiere roles={ROLES_CONSULTA}><Explorar /></Requiere>} />
        <Route path="ninos" element={<Requiere roles={ROLES_CLINICOS}><Ninos /></Requiere>} />
        <Route path="ninos/:sujeto" element={<Requiere roles={ROLES_CLINICOS}><Nino /></Requiere>} />
        <Route path="revision/datos" element={<Requiere roles={ROLES_CLINICOS}><Navigate to="/admin/calidad-datos" replace /></Requiere>} />
        <Route path="admin/calidad-datos" element={<Requiere roles={ROLES_CLINICOS}><AdminCalidadDatos /></Requiere>} />
        <Route path="revision" element={<Requiere roles={ROLES_CLINICOS}><Navigate to="/revision/riesgos" replace /></Requiere>} />
        <Route path="revision/riesgos" element={<Requiere roles={ROLES_CLINICOS}><RevisionRiesgos /></Requiere>} />
        <Route path="inferencia" element={<Navigate to="/prediccion" replace />} />
        <Route path="prediccion" element={<Requiere roles={ROLES_CLINICOS}><PrediccionMarco /></Requiere>} />
        <Route path="mis-modelos" element={<Requiere roles={ROLES_CLINICOS}><MisModelos /></Requiere>} />
        <Route path="diccionario" element={<Requiere roles={ROLES_CLINICOS}><Diccionario /></Requiere>} />
        <Route path="admin/configuracion" element={<Requiere roles={ROLES_ADMIN}><AdminConfiguracion /></Requiere>} />
        <Route path="admin/programacion" element={<Requiere roles={ROLES_ADMIN}><AdminProgramacion /></Requiere>} />
        <Route path="admin/entrenamientos" element={<Requiere roles={ROLES_ADMIN}><AdminEntrenamientos /></Requiere>} />
        <Route path="admin/modelos" element={<Requiere roles={ROLES_ADMIN}><AdminModelos /></Requiere>} />
        <Route path="admin/corridas" element={<Requiere roles={ROLES_ADMIN}><AdminCorridas /></Requiere>} />
        <Route path="admin/usuarios" element={<Requiere roles={ROLES_ADMIN}><AdminUsuarios /></Requiere>} />
        <Route path="notificaciones" element={<Requiere roles={ROLES_ADMIN}><Navigate to="/notificaciones/alertas" replace /></Requiere>} />
        <Route path="notificaciones/servidor" element={<Requiere roles={ROLES_ADMIN}><NotifServidor /></Requiere>} />
        <Route path="notificaciones/alertas" element={<Requiere roles={ROLES_ADMIN}><NotifAlertas /></Requiere>} />
        <Route path="admin/notificaciones" element={<Requiere roles={ROLES_ADMIN}><Navigate to="/notificaciones/alertas" replace /></Requiere>} />
        <Route path="analitica" element={<Requiere roles={ROLES_CONSULTA}><AnaliticaLayout /></Requiere>}>
          <Route index element={<ARresumen />} />
          <Route path=":submodulo" element={<SubmoduloAnalitica />} />
        </Route>
        <Route path="*" element={<div><h1>No existe esa página</h1><p className="mt-2 text-salvia">Revise la dirección o vuelva a la vista clínica.</p></div>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={cliente}>
      <ProveedorSesion>
        <BrowserRouter>
          <Rutas />
        </BrowserRouter>
      </ProveedorSesion>
    </QueryClientProvider>
  )
}

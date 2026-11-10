import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { ErrorApi } from './api/cliente'
import { ProveedorSesion, Requiere } from './auth/sesion'
import { Marco } from './components/Marco'

import Ingresar from './paginas/Ingresar'

// Cada página se descarga cuando se abre: la primera carga queda liviana.
const AdminCalidadDatos = lazy(() => import('./paginas/AdminCalidadDatos'))
const AdminConfiguracion = lazy(() => import('./paginas/AdminConfiguracion'))
const AdminCorridas = lazy(() => import('./paginas/AdminCorridas'))
const AdminEntrenamientos = lazy(() => import('./paginas/AdminEntrenamientos'))
const AdminModelos = lazy(() => import('./paginas/AdminModelos'))
const AdminNotificaciones = lazy(() => import('./paginas/AdminNotificaciones'))
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
        <Route index element={<Tablero />} />
        <Route path="explorar" element={<Requiere roles={['admin', 'experto', 'visualizador']}><Explorar /></Requiere>} />
        <Route path="ninos" element={<Ninos />} />
        <Route path="ninos/:sujeto" element={<Nino />} />
        <Route path="revision/datos" element={<Requiere roles={['admin']}><Navigate to="/admin/calidad-datos" replace /></Requiere>} />
        <Route path="admin/calidad-datos" element={<Requiere roles={['admin']}><AdminCalidadDatos /></Requiere>} />
        <Route path="revision/riesgos" element={<Requiere roles={['admin', 'experto']}><RevisionRiesgos /></Requiere>} />
        <Route path="inferencia" element={<Navigate to="/prediccion" replace />} />
        <Route path="prediccion" element={<Requiere roles={['admin', 'experto']}><PrediccionMarco /></Requiere>} />
        <Route path="mis-modelos" element={<Requiere roles={['admin', 'experto']}><MisModelos /></Requiere>} />
        <Route path="diccionario" element={<Requiere roles={['admin', 'experto']}><Diccionario /></Requiere>} />
        <Route path="admin/configuracion" element={<Requiere roles={['admin']}><AdminConfiguracion /></Requiere>} />
        <Route path="admin/programacion" element={<Requiere roles={['admin']}><AdminProgramacion /></Requiere>} />
        <Route path="admin/entrenamientos" element={<Requiere roles={['admin']}><AdminEntrenamientos /></Requiere>} />
        <Route path="admin/modelos" element={<Requiere roles={['admin']}><AdminModelos /></Requiere>} />
        <Route path="admin/corridas" element={<Requiere roles={['admin']}><AdminCorridas /></Requiere>} />
        <Route path="admin/usuarios" element={<Requiere roles={['admin']}><AdminUsuarios /></Requiere>} />
        <Route path="admin/notificaciones" element={<Requiere roles={['admin']}><AdminNotificaciones /></Requiere>} />
        <Route path="analitica" element={<Requiere roles={['admin', 'experto', 'visualizador']}><AnaliticaLayout /></Requiere>}>
          <Route index element={<ARresumen />} />
          <Route path=":submodulo" element={<SubmoduloAnalitica />} />
        </Route>
        <Route path="*" element={<div><h1>No existe esa página</h1><p className="mt-2 text-salvia">Revise la dirección o vuelva al tablero.</p></div>} />
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

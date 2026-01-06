import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DocumentList from './pages/DocumentList'
import Layout from './components/Layout/Layout'
import { EditorProvider } from './contexts/EditorContext'

function App() {
  return (
    <HashRouter>
      <EditorProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<DocumentList />} />
          <Route path="/document/:id" element={<Layout />} />
        </Routes>
      </EditorProvider>
    </HashRouter>
  )
}

export default App


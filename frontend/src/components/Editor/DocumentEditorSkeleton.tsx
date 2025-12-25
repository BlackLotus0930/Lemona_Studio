import { useTheme } from '../../contexts/ThemeContext'

export function DocumentEditorSkeleton() {
  const { theme } = useTheme()
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const skeletonShimmer = theme === 'dark' 
    ? 'linear-gradient(90deg, #2a2a2a 0%, #333333 50%, #2a2a2a 100%)'
    : 'linear-gradient(90deg, #f5f5f5 0%, #e8e8e8 50%, #f5f5f5 100%)'
  
  const shimmerAnimation = {
    background: skeletonShimmer,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: bgColor,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 60px',
        overflow: 'auto',
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
      
      {/* Title skeleton */}
      <div
        style={{
          height: '40px',
          width: '300px',
          borderRadius: '4px',
          marginBottom: '24px',
          ...shimmerAnimation,
        }}
      />
      
      {/* Content lines skeleton */}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          style={{
            height: '20px',
            width: `${Math.random() * 40 + 60}%`,
            borderRadius: '4px',
            marginBottom: '16px',
            ...shimmerAnimation,
          }}
        />
      ))}
      
      {/* Paragraph spacing */}
      <div style={{ height: '24px' }} />
      
      {/* More content lines */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={`p2-${i}`}
          style={{
            height: '20px',
            width: `${Math.random() * 40 + 60}%`,
            borderRadius: '4px',
            marginBottom: '16px',
            ...shimmerAnimation,
          }}
        />
      ))}
    </div>
  )
}


import { useTheme } from '../../contexts/ThemeContext'

interface FileExplorerSkeletonProps {
  projectName?: string
}

export function FileExplorerSkeleton({ projectName: _projectName = 'LEMONA' }: FileExplorerSkeletonProps) {
  const { theme } = useTheme()
  
  const bgColor = theme === 'dark' ? '#1e1e1e' : '#F8F8F6'
  const skeletonShimmer = theme === 'dark' 
    ? 'linear-gradient(90deg, #2a2a2a 0%, #333333 50%, #2a2a2a 100%)'
    : 'linear-gradient(90deg, #f5f5f5 0%, #e8e8e8 50%, #f5f5f5 100%)'
  
  // Animation for shimmer effect
  const shimmerAnimation = {
    background: skeletonShimmer,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
  }

  // Generate random widths for variety
  const getRandomWidth = (base: number, variance: number) => 
    `${base + Math.floor(Math.random() * variance)}px`

  return (
    <div
      className="scrollable-container no-gutter"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: bgColor,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box',
        position: 'relative',
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
      
      {/* README.md skeleton */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 16px 6px 8px',
          marginBottom: '4px',
          borderRadius: '6px',
          cursor: 'default',
        }}
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            marginRight: '8px',
            borderRadius: '6px',
            ...shimmerAnimation,
          }}
        />
        <div
          style={{
            height: '14px',
            width: '90px',
            borderRadius: '6px',
            ...shimmerAnimation,
          }}
        />
      </div>

      {/* Library folder skeleton */}
      <div style={{ marginBottom: '8px' }}>
        {/* Folder header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 16px 6px 8px',
            borderRadius: '6px',
            marginBottom: '2px',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              marginRight: '6px',
              borderRadius: '6px',
              ...shimmerAnimation,
            }}
          />
          <div
            style={{
              height: '14px',
              width: '70px',
              borderRadius: '6px',
              ...shimmerAnimation,
            }}
          />
        </div>
        
        {/* Library files skeleton - show multiple items with varied widths */}
        <div style={{ paddingLeft: '24px' }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 16px 6px 8px',
                borderRadius: '6px',
                marginBottom: '2px',
              }}
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  marginRight: '8px',
                  borderRadius: '6px',
                  ...shimmerAnimation,
                }}
              />
              <div
                style={{
                  height: '14px',
                  width: getRandomWidth(100, 80),
                  borderRadius: '6px',
                  ...shimmerAnimation,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Project folder skeleton (Workspace) */}
      <div>
        {/* Folder header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 16px 6px 8px',
            borderRadius: '6px',
            marginBottom: '2px',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              marginRight: '6px',
              borderRadius: '6px',
              ...shimmerAnimation,
            }}
          />
          <div
            style={{
              height: '14px',
              width: '85px',
              borderRadius: '6px',
              ...shimmerAnimation,
            }}
          />
        </div>
        
        {/* Project files skeleton - show fewer items initially */}
        <div style={{ paddingLeft: '24px' }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 16px 6px 8px',
                borderRadius: '6px',
                marginBottom: '2px',
              }}
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  marginRight: '8px',
                  borderRadius: '6px',
                  ...shimmerAnimation,
                }}
              />
              <div
                style={{
                  height: '14px',
                  width: getRandomWidth(90, 70),
                  borderRadius: '6px',
                  ...shimmerAnimation,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


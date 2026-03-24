"use client"

import { useEffect, useRef, useState } from "react"
import {
  MousePointer2,
  Pencil,
  Square,
  Circle,
  ArrowRight,
  Type,
  Eraser,
  Download,
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Tool = "select" | "draw" | "rectangle" | "circle" | "arrow" | "text" | "redact"

interface ImageEditorProps {
  imageUrl: string
  onClose: () => void
  onSave?: (dataUrl: string) => void
}

export function ImageEditor({ imageUrl, onClose, onSave }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<any>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [color, setColor] = useState("#ef4444")
  const [brushSize, setBrushSize] = useState(3)
  const [isReady, setIsReady] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let canvas: any = null
    let isMounted = true

    const initCanvas = async () => {
      const fabric = await import("fabric")

      if (!canvasRef.current || !isMounted) return

      const imgElement = document.createElement("img")

      if (!imageUrl.startsWith("data:")) {
        imgElement.crossOrigin = "anonymous"
      }

      await new Promise<void>((resolve, reject) => {
        imgElement.onload = () => resolve()
        imgElement.onerror = (e) => reject(new Error("Failed to load image"))
        imgElement.src = imageUrl
      })

      if (!isMounted) return

      const maxWidth = window.innerWidth * 0.8
      const maxHeight = window.innerHeight * 0.7
      const scale = Math.min(maxWidth / imgElement.width, maxHeight / imgElement.height)
      const canvasWidth = imgElement.width * scale
      const canvasHeight = imgElement.height * scale

      canvasRef.current!.width = canvasWidth
      canvasRef.current!.height = canvasHeight

      canvas = new fabric.Canvas(canvasRef.current, {
        width: canvasWidth,
        height: canvasHeight,
        selection: true,
        preserveObjectStacking: true,
      })
      fabricRef.current = canvas

      // Create fabric image and add to canvas
      const img = new fabric.FabricImage(imgElement, {
        left: 0,
        top: 0,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
        originX: "left",
        originY: "top",
      })

      canvas.add(img)
      canvas.sendObjectToBack(img)
      canvas.renderAll()

      setIsReady(true)
    }

    initCanvas().catch((err) => {
      console.error("Failed to initialize canvas:", err)
    })

    return () => {
      isMounted = false
      if (canvas) {
        canvas.dispose()
      }
    }
  }, [imageUrl])

  useEffect(() => {
    const setupBrush = async () => {
      const canvas = fabricRef.current
      if (!canvas || !isReady) return

      const fabric = await import("fabric")

      canvas.isDrawingMode = false
      canvas.selection = true
      canvas.defaultCursor = "default"

      if (tool === "draw") {
        canvas.isDrawingMode = true
        if (!canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        }
        canvas.freeDrawingBrush.color = color
        canvas.freeDrawingBrush.width = brushSize
      } else if (tool === "redact") {
        canvas.isDrawingMode = true
        if (!canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        }
        canvas.freeDrawingBrush.color = "#000000"
        canvas.freeDrawingBrush.width = 20
      }
    }

    setupBrush()
  }, [tool, color, brushSize, isReady])

  const addShape = async (type: "rectangle" | "circle" | "arrow" | "text") => {
    const fabric = await import("fabric")
    const canvas = fabricRef.current
    if (!canvas) return

    const center = {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
    }
    let obj: any

    switch (type) {
      case "rectangle":
        obj = new fabric.Rect({
          left: center.left - 50,
          top: center.top - 30,
          width: 100,
          height: 60,
          fill: "transparent",
          stroke: color,
          strokeWidth: 3,
        })
        break
      case "circle":
        obj = new fabric.Circle({
          left: center.left - 30,
          top: center.top - 30,
          radius: 30,
          fill: "transparent",
          stroke: color,
          strokeWidth: 3,
        })
        break
      case "arrow":
        const points = [
          { x: center.left - 50, y: center.top },
          { x: center.left + 50, y: center.top },
        ]
        obj = new fabric.Line([points[0].x, points[0].y, points[1].x, points[1].y], {
          stroke: color,
          strokeWidth: 3,
        })
        // Add arrowhead
        const arrow = new fabric.Triangle({
          left: points[1].x,
          top: points[1].y - 10,
          width: 20,
          height: 20,
          fill: color,
          angle: 90,
          originX: "center",
          originY: "center",
        })
        canvas.add(obj)
        canvas.add(arrow)
        canvas.setActiveObject(arrow)
        return
      case "text":
        obj = new fabric.IText("Add text", {
          left: center.left - 40,
          top: center.top - 10,
          fontSize: 20,
          fill: color,
          fontFamily: "Arial",
        })
        break
    }

    if (obj) {
      canvas.add(obj)
      canvas.setActiveObject(obj)
    }
  }

  const handleToolClick = (newTool: Tool) => {
    setTool(newTool)
    if (["rectangle", "circle", "arrow", "text"].includes(newTool)) {
      addShape(newTool as any)
      setTool("select")
    }
  }

  const deleteSelected = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const active = canvas.getActiveObjects()
    active.forEach((obj: any) => {
      if (obj.selectable !== false) {
        canvas.remove(obj)
      }
    })
    canvas.discardActiveObject()
  }

  const handleUndo = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const objects = canvas.getObjects()
    if (objects.length > 1) {
      canvas.remove(objects[objects.length - 1])
    }
  }

  const handleZoomIn = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const newZoom = Math.min(zoom * 1.2, 3)
    const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 }
    canvas.zoomToPoint(center, newZoom)
    canvas.renderAll()
    setZoom(newZoom)
  }

  const handleZoomOut = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const newZoom = Math.max(zoom / 1.2, 0.5)
    const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 }
    canvas.zoomToPoint(center, newZoom)
    canvas.renderAll()
    setZoom(newZoom)
  }

  const handleDownload = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL({ format: "png", quality: 1 })
    const link = document.createElement("a")
    link.download = "annotated-screenshot.png"
    link.href = dataUrl
    link.click()
  }

  const handleSave = () => {
    const canvas = fabricRef.current
    if (!canvas || !onSave) return
    const dataUrl = canvas.toDataURL({ format: "png", quality: 1 })
    onSave(dataUrl)
    onClose()
  }

  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000", "#ffffff"]

  const ToolButton = ({ toolName, icon: Icon, title }: { toolName: Tool; icon: any; title: string }) => (
    <button
      onClick={() => handleToolClick(toolName)}
      title={title}
      className={cn(
        "p-2 rounded-lg hover:bg-white/20 transition-colors",
        tool === toolName && "bg-white/30"
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
        <div className="flex items-center gap-1">
          <ToolButton toolName="select" icon={MousePointer2} title="Select" />
          <ToolButton toolName="draw" icon={Pencil} title="Draw" />
          <ToolButton toolName="rectangle" icon={Square} title="Rectangle" />
          <ToolButton toolName="circle" icon={Circle} title="Circle" />
          <ToolButton toolName="arrow" icon={ArrowRight} title="Arrow" />
          <ToolButton toolName="text" icon={Type} title="Text" />
          <ToolButton toolName="redact" icon={Eraser} title="Redact" />

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Colors */}
          <div className="flex items-center gap-1">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-transform",
                  color === c ? "border-white scale-110" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          <button onClick={handleUndo} title="Undo" className="p-2 rounded-lg hover:bg-white/20">
            <RotateCcw className="h-5 w-5" />
          </button>
          <button onClick={deleteSelected} title="Delete Selected" className="p-2 rounded-lg hover:bg-white/20 text-red-400">
            <X className="h-5 w-5" />
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {(tool === "draw" || tool === "redact") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Size:</span>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20 h-1 accent-white"
              />
              <span className="text-xs w-4">{brushSize}</span>
            </div>
          )}

          <div className="w-px h-6 bg-gray-600 mx-2" />

          <button onClick={handleZoomOut} title="Zoom Out" className="p-2 rounded-lg hover:bg-white/20">
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} title="Zoom In" className="p-2 rounded-lg hover:bg-white/20">
            <ZoomIn className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload} className="text-white border-gray-600">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          {onSave && (
            <Button size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        {!isReady && (
          <div className="text-white text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2" />
            <p>Loading image...</p>
          </div>
        )}
        <canvas ref={canvasRef} className={cn("rounded-lg shadow-2xl", !isReady && "hidden")} />
      </div>
    </div>
  )
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HardDrive,
  Plus,
  Image as ImageIcon,
  Calendar,
  Database,
} from "lucide-react";

interface StoredImage {
  name: string;
  path: string;
  size_mb: number;
  modified: number;
}

export function LandingPage() {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/images");
      const data = await response.json();
      setImages(data.images || []);
    } catch (error) {
      console.error("Failed to load images:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSize = (sizeMb: number) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(2)} GB`;
    }
    return `${sizeMb} MB`;
  };

  return (
    <div className="relative z-10 container mx-auto px-6 py-16 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Your Images
          </h2>
          <p className="text-lg text-slate-400">
            Select an image to flash or create a new one
          </p>
        </div>
        <Link href="/create">
          <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white border-0 h-12 px-6 font-medium shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all">
            <Plus className="w-5 h-5 mr-2" />
            Create New Image
          </Button>
        </Link>
      </div>

      {/* Images List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
            <p className="text-slate-400">Loading images...</p>
          </div>
        </div>
      ) : images.length === 0 ? (
        <Card className="border border-white/10 bg-background/40 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/20 flex items-center justify-center mb-6">
              <ImageIcon className="w-10 h-10 text-orange-500" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-3">
              No images yet
            </h3>
            <p className="text-slate-400 mb-6 text-center max-w-md">
              Get started by creating your first customized OS image
            </p>
            <Link href="/create">
              <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white border-0 h-11 px-6 font-medium shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all">
                <Plus className="w-5 h-5 mr-2" />
                Create Your First Image
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {images.map((image) => (
            <Card
              key={image.path}
              className={`group relative overflow-hidden border transition-all duration-300 cursor-pointer backdrop-blur-sm ${
                selectedImage === image.path
                  ? "border-blue-500/70 bg-blue-500/5 shadow-lg shadow-blue-500/20"
                  : "border-white/10 bg-background/40 hover:border-white/20 hover:bg-background/60"
              }`}
              onClick={() => setSelectedImage(image.path)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                        selectedImage === image.path
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30"
                          : "bg-gradient-to-br from-slate-600 to-slate-700 group-hover:from-slate-500 group-hover:to-slate-600"
                      }`}
                    >
                      <HardDrive className="w-7 h-7 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-semibold text-white mb-2 truncate">
                        {image.name}
                      </h3>
                      <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-4 h-4" />
                          <span>{formatSize(image.size_mb)}</span>
                        </div>
                        {image.modified && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(image.modified)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedImage === image.path && (
                    <Link
                      href={`/flash?image=${encodeURIComponent(image.path)}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 h-11 px-6 font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all">
                        <HardDrive className="w-4 h-4 mr-2" />
                        Flash This Image
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info Section */}
      {images.length > 0 && (
        <div className="mt-8 text-center text-sm text-slate-400">
          <p>
            Click on an image to select it, then click "Flash This Image" to
            write it to a device
          </p>
        </div>
      )}
    </div>
  );
}

package main

import (
	"image/png"
	"os"
	"testing"
)

func TestAppIconPNGUsesFullCanvasRoundedBackground(t *testing.T) {
	f, err := os.Open("build/appicon.png")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	img, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}

	bounds := img.Bounds()
	if bounds.Dx() != 1024 || bounds.Dy() != 1024 {
		t.Fatalf("app icon must be 1024x1024, got %dx%d", bounds.Dx(), bounds.Dy())
	}

	corners := []struct {
		name string
		x    int
		y    int
	}{
		{"top-left", bounds.Min.X, bounds.Min.Y},
		{"top-right", bounds.Max.X - 1, bounds.Min.Y},
		{"bottom-left", bounds.Min.X, bounds.Max.Y - 1},
		{"bottom-right", bounds.Max.X - 1, bounds.Max.Y - 1},
	}
	for _, corner := range corners {
		_, _, _, a := img.At(corner.x, corner.y).RGBA()
		if a != 0 {
			t.Fatalf("%s corner must be transparent, alpha=%d", corner.name, a)
		}
	}

	_, _, _, centerAlpha := img.At(bounds.Min.X+bounds.Dx()/2, bounds.Min.Y+bounds.Dy()/2).RGBA()
	if centerAlpha == 0 {
		t.Fatal("app icon center must contain visible artwork")
	}

	edgePoints := []struct {
		name string
		x    int
		y    int
	}{
		{"top", bounds.Min.X + bounds.Dx()/2, bounds.Min.Y},
		{"right", bounds.Max.X - 1, bounds.Min.Y + bounds.Dy()/2},
		{"bottom", bounds.Min.X + bounds.Dx()/2, bounds.Max.Y - 1},
		{"left", bounds.Min.X, bounds.Min.Y + bounds.Dy()/2},
	}
	for _, point := range edgePoints {
		_, _, _, a := img.At(point.x, point.y).RGBA()
		if a == 0 {
			t.Fatalf("%s edge must contain visible rounded-rect background", point.name)
		}
	}
}

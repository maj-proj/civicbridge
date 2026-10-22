from ultralytics import YOLO

model = YOLO("best.pt")

results = model.predict(
    source="garbage4.jpeg",
    conf=0.15,
    imgsz=960,
    verbose=False
)

result = results[0]

for box in result.boxes:
    class_id = int(box.cls.item())
    confidence = float(box.conf.item())

    print({
        "class": result.names[class_id],
        "confidence": round(confidence * 100, 2),
        "box": box.xyxy[0].tolist()
    })

result.save("annotated_garbage4.jpg")
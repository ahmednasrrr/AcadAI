import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

cm = np.array([[489, 48, 107],
               [12, 1386, 31],
               [31, 107, 590]])

labels = ['High', 'Low', 'Medium']

plt.figure(figsize=(7, 5))
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=labels, yticklabels=labels)
plt.title('Confusion Matrix – Risk Classification')
plt.ylabel('Actual')
plt.xlabel('Predicted')
plt.tight_layout()
plt.show()